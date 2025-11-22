<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

interface ParsedTrack {
  id: string
  title: string
  artist: string
  album: string
  location: string
  bpm?: string
  durationSeconds?: number
  bitRate?: number
  elementIndex: number
}

interface HiResFile {
  name: string
  relativePath: string
  file?: File
}

interface ScoredFile {
  file: HiResFile
  score: number
}

interface Mapping {
  trackId: string
  relativePath: string
  resolvedPath: string
}

const rekordboxDoc = ref<Document | null>(null)
const rekordboxXmlText = ref<string>('')
const tracks = ref<ParsedTrack[]>([])
const xmlError = ref<string>('')
const loadingXml = ref(false)
const activeTrackId = ref<string | null>(null)
const ignoredTrackIds = ref<Set<string>>(new Set())
const mappingByTrack = ref<Record<string, Mapping>>({})

const hiResFiles = ref<HiResFile[]>([])
const hiResSearch = ref('')
const extensionFilter = ref('all')
const pickingHiRes = ref(false)
const selectedHiResPath = ref<string | null>(null)

const basePath = ref('')

const xmlInputRef = ref<HTMLInputElement | null>(null)
const hiResInputRef = ref<HTMLInputElement | null>(null)

const statusFilter = ref<'all' | 'unmatched' | 'matched' | 'ignored'>('unmatched')
const bitRateFilter = ref<'all' | 'low' | 'mid' | 'high' | 'lossyHigh'>('all')
const trackSearch = ref('')

const hasXml = computed(() => !!rekordboxDoc.value && tracks.value.length > 0)
const hasHiRes = computed(() => hiResFiles.value.length > 0)
const hasMappings = computed(() => Object.keys(mappingByTrack.value).length > 0)

const summary = computed(() => {
  let matched = 0
  let ignored = 0
  tracks.value.forEach((track) => {
    const status = getStatus(track.id)
    if (status === 'matched') matched += 1
    if (status === 'ignored') ignored += 1
  })

  return {
    total: tracks.value.length,
    matched,
    ignored,
    unmatched: Math.max(tracks.value.length - matched - ignored, 0),
  }
})

const filteredTracks = computed(() => {
  const search = trackSearch.value.toLowerCase().trim()

  return tracks.value.filter((track) => {
    const status = getStatus(track.id)
    if (statusFilter.value !== 'all' && status !== statusFilter.value) return false
    if (!matchBitRateFilter(track)) return false

    if (!search) return true
    const blob = `${track.title} ${track.artist} ${track.album} ${track.location}`.toLowerCase()
    return blob.includes(search)
  })
})

const activeTrack = computed(() => tracks.value.find((item) => item.id === activeTrackId.value) || null)

const scoredHiRes = computed<ScoredFile[]>(() => {
  return hiResFiles.value.map((file) => ({
    file,
    score: activeTrack.value ? scoreMatch(activeTrack.value, file) : 0,
  }))
})

const filteredHiRes = computed(() => {
  const search = hiResSearch.value.toLowerCase().trim()
  const extFilter = extensionFilter.value

  return scoredHiRes.value
    .filter(({ file }) => {
      if (extFilter !== 'all' && !file.name.toLowerCase().endsWith(extFilter)) return false
      if (!search) return true
      const blob = `${file.name} ${file.relativePath}`.toLowerCase()
      return blob.includes(search)
    })
    .sort((a, b) => b.score - a.score || a.file.relativePath.localeCompare(b.file.relativePath))
})

const suggestions = computed(() => filteredHiRes.value.filter((item) => item.score > 0).slice(0, 5))

const scoreLookup = computed<Record<string, number>>(() =>
  Object.fromEntries(scoredHiRes.value.map((item) => [item.file.relativePath, item.score]))
)

watch(
  () => [activeTrackId.value, hiResFiles.value],
  () => {
    const top = suggestions.value[0]
    selectedHiResPath.value = top?.file.relativePath ?? null
  },
  { immediate: true }
)

watch(
  () => filteredTracks.value,
  (list) => {
    if (!activeTrackId.value && list.length) {
      activeTrackId.value = list[0].id
    }
  },
  { immediate: true }
)

onMounted(() => {
  // Autofocus on the first track when tracks are loaded.
  if (tracks.value.length && !activeTrackId.value) {
    activeTrackId.value = tracks.value[0].id
  }
})

function getStatus(trackId: string): 'matched' | 'ignored' | 'unmatched' {
  if (mappingByTrack.value[trackId]) return 'matched'
  if (ignoredTrackIds.value.has(trackId)) return 'ignored'
  return 'unmatched'
}

function matchBitRateFilter(track: ParsedTrack) {
  if (bitRateFilter.value === 'all') return true
  if (!track.bitRate) return false
  const br = track.bitRate
  if (bitRateFilter.value === 'low') return br <= 160
  if (bitRateFilter.value === 'mid') return br > 160 && br <= 256
  if (bitRateFilter.value === 'lossyHigh') return br > 256 && br < 320
  if (bitRateFilter.value === 'high') return br >= 320
  return true
}

async function onXmlSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    await parseRekordboxFile(file)
  }
  input.value = ''
}

async function parseRekordboxFile(file: File) {
  loadingXml.value = true
  xmlError.value = ''
  try {
    const text = await file.text()
    rekordboxXmlText.value = text
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'application/xml')

    if (doc.querySelector('parsererror')) {
      xmlError.value = 'Unable to parse XML. Please check the file.'
      return
    }

    const trackElements = Array.from(doc.querySelectorAll('COLLECTION > TRACK'))

    const parsed: ParsedTrack[] = trackElements.map((el, index) => {
      const id = el.getAttribute('TrackID') || `track-${index}`
      const bitRateRaw = el.getAttribute('BitRate')
      const totalTimeRaw = el.getAttribute('TotalTime')
      return {
        id,
        title: el.getAttribute('Name') || 'Untitled',
        artist: el.getAttribute('Artist') || 'Unknown artist',
        album: el.getAttribute('Album') || '',
        location: decodeRekordboxPath(el.getAttribute('Location') || ''),
        bpm: el.getAttribute('AverageBpm') || undefined,
        durationSeconds: totalTimeRaw ? Number(totalTimeRaw) : undefined,
        bitRate: bitRateRaw ? Number(bitRateRaw) : undefined,
        elementIndex: index,
      }
    })

    tracks.value = parsed
    rekordboxDoc.value = doc
    ignoredTrackIds.value = new Set()
    mappingByTrack.value = {}

    // Seed base path from the first track's location (strip filename).
    if (parsed.length && parsed[0].location) {
      const normalized = parsed[0].location.replace(/\\/g, '/')
      const lastSlash = normalized.lastIndexOf('/')
      basePath.value = lastSlash > 0 ? normalized.slice(0, lastSlash) : normalized
    }

    activeTrackId.value = parsed[0]?.id ?? null
  } catch (err) {
    console.error(err)
    xmlError.value = 'Failed to read file.'
  } finally {
    loadingXml.value = false
  }
}

function decodeRekordboxPath(path: string) {
  if (!path) return ''
  const cleaned = path.replace('file://localhost', '').replace('file://', '')
  try {
    return decodeURI(cleaned)
  } catch (e) {
    return cleaned
  }
}

function formatDuration(seconds?: number) {
  if (!seconds && seconds !== 0) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function scoreMatch(track: ParsedTrack, file: HiResFile) {
  const trackTokens = tokenize(`${track.artist} ${track.title}`)
  if (!trackTokens.length) return 0

  const fileTokens = tokenize(stripExtension(file.name))
  const pathTokens = tokenize(file.relativePath)
  const candidateTokens = new Set([...fileTokens, ...pathTokens])

  let common = 0
  trackTokens.forEach((token) => {
    if (candidateTokens.has(token)) common += 1
  })

  const overlap = common / trackTokens.length
  const titleHit = stripExtension(file.name)
    .toLowerCase()
    .includes(track.title.toLowerCase().slice(0, Math.min(track.title.length, 14)))
    ? 0.15
    : 0

  return Number(Math.min(overlap + titleHit, 1).toFixed(3))
}

function tokenize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

function stripExtension(name: string) {
  return name.replace(/\\.[^.]+$/, '')
}

function triggerXmlPicker() {
  xmlInputRef.value?.click()
}

function triggerHiResPicker() {
  if ('showDirectoryPicker' in window) {
    pickHiResDirectory()
  } else {
    hiResInputRef.value?.click()
  }
}

async function pickHiResDirectory() {
  pickingHiRes.value = true
  try {
    const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
    const collected: HiResFile[] = []
    await walkDirectory(dirHandle, '', collected)
    hiResFiles.value = collected.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  } catch (err) {
    console.warn('Directory pick cancelled or failed', err)
  } finally {
    pickingHiRes.value = false
  }
}

async function walkDirectory(handle: FileSystemDirectoryHandle, prefix: string, bucket: HiResFile[]) {
  for await (const entry of handle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile()
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      bucket.push({ name: entry.name, relativePath, file })
    } else if (entry.kind === 'directory') {
      const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
      await walkDirectory(entry, newPrefix, bucket)
    }
  }
}

function onHiResFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return

  const collected: HiResFile[] = files.map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    return { name: file.name, relativePath: rel.replace(/^\//, ''), file }
  })

  hiResFiles.value = collected.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  input.value = ''
}

function selectTrack(trackId: string) {
  activeTrackId.value = trackId
}

function selectHiRes(path: string) {
  selectedHiResPath.value = path
}

function confirmMapping(file?: HiResFile) {
  const track = activeTrack.value
  if (!track) return
  const candidate = file || hiResFiles.value.find((item) => item.relativePath === selectedHiResPath.value)
  if (!candidate) return
  const newPath = buildRekordboxPath(basePath.value, candidate.relativePath)
  mappingByTrack.value = {
    ...mappingByTrack.value,
    [track.id]: {
      trackId: track.id,
      relativePath: candidate.relativePath,
      resolvedPath: newPath,
    },
  }
  ignoredTrackIds.value = new Set(Array.from(ignoredTrackIds.value).filter((id) => id !== track.id))
  moveToNextUnmatched(track.id)
}

function buildRekordboxPath(base: string, relative: string) {
  const trimmedBase = base.trim()
  const cleanedBase = trimmedBase
    .replace(/^file:\/\/localhost/i, '')
    .replace(/^file:\/\//i, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
  const cleanedRelative = relative.replace(/^\//, '').replace(/\\/g, '/')
  let joined = `${cleanedBase}/${cleanedRelative}`

  const hasDrivePrefix = /^[a-zA-Z]:/.test(joined)
  if (!hasDrivePrefix && !joined.startsWith('/')) {
    joined = `/${joined}`
  }

  const prefix = joined.startsWith('/') ? 'file://localhost' : 'file://localhost/'
  return encodeURI(prefix + joined)
}

function moveToNextUnmatched(currentId: string) {
  const currentIndex = tracks.value.findIndex((t) => t.id === currentId)
  const order = [...tracks.value.slice(currentIndex + 1), ...tracks.value.slice(0, currentIndex)]
  const next = order.find((t) => getStatus(t.id) === 'unmatched')
  if (next) {
    activeTrackId.value = next.id
  }
}

function toggleIgnore(trackId: string) {
  const next = new Set(ignoredTrackIds.value)
  if (next.has(trackId)) {
    next.delete(trackId)
  } else {
    next.add(trackId)
    delete mappingByTrack.value[trackId]
  }
  ignoredTrackIds.value = next
}

function clearMappings() {
  mappingByTrack.value = {}
  ignoredTrackIds.value = new Set()
}

function canExport() {
  return rekordboxDoc.value && Object.keys(mappingByTrack.value).length > 0 && basePath.value.trim().length > 0
}

function exportUpdatedXml() {
  if (!rekordboxDoc.value) return
  if (!basePath.value.trim()) {
    alert('Please provide a base Rekordbox path to build new file locations.')
    return
  }

  const cloned = rekordboxDoc.value.cloneNode(true) as Document
  const trackElements = Array.from(cloned.querySelectorAll('COLLECTION > TRACK'))

  trackElements.forEach((el, index) => {
    const id = el.getAttribute('TrackID') || `track-${index}`
    const mapping = mappingByTrack.value[id]
    if (mapping) {
      const newPath = buildRekordboxPath(basePath.value, mapping.relativePath)
      el.setAttribute('Location', newPath)
    }
  })

  const serializer = new XMLSerializer()
  const xmlString = serializer.serializeToString(cloned)
  const blob = new Blob([xmlString], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'rekordbox-updated.xml'
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <main class="page">
    <header class="topbar card">
      <div class="hero-head">
        <div>
          <p class="eyebrow">Rekordbox path remapper</p>
          <h1>Rekordbox XML File Path Replacer</h1>
          <p class="lede">
            Update file paths/locations in your library. Point to higher
            quality/bitrate files, etc.
          </p>
        </div>
        <div class="summary" v-if="summary.total > 0">
          <div class="pill">Tracks: {{ summary.total }}</div>
          <div class="pill">Unmatched: {{ summary.unmatched }}</div>
          <div class="pill">Matched: {{ summary.matched }}</div>
          <div class="pill">Ignored: {{ summary.ignored }}</div>
        </div>
      </div>

      <div class="steps">
        <div class="step" :class="{ ready: hasXml }">
          <div class="step-label">Step 1 · Load Rekordbox XML</div>
          <p class="muted small">
            Select your rekordbox.xml file. Nothing is uploaded.
          </p>
          <div class="step-actions">
            <button
              class="btn primary"
              @click="triggerXmlPicker"
              :disabled="loadingXml"
            >
              {{ loadingXml ? 'Loading XML…' : 'Choose rekordbox.xml' }}
            </button>
            <span v-if="hasXml" class="micro">
              ✓ Loaded {{ summary.total }} tracks
            </span>
          </div>
        </div>

        <div class="step" :class="{ disabled: !hasXml, ready: hasHiRes }">
          <div class="step-label">
            Step 2 · Select folder with new audio files
          </div>
          <p class="muted small">
            Use the same folder you’ll point Rekordbox to.
          </p>
          <div class="step-actions">
            <button
              class="btn"
              @click="triggerHiResPicker"
              :disabled="pickingHiRes || !hasXml"
            >
              {{ pickingHiRes ? 'Reading folder…' : 'Select folder with new audio files' }}
            </button>
            <span v-if="hasHiRes" class="micro">
              ✓ {{ hiResFiles.length }} files indexed
            </span>
          </div>
        </div>

        <div class="step" :class="{ disabled: !hasXml }">
          <div class="step-label">Step 3 · Enter new music folder path</div>
          <p class="muted small">
            This is the full path to where Rekordbox will find the new files.
            Typically, this is identical to the folder you selected above in
            Step 2.
          </p>
          <div class="base-path">
            <input
              id="base-path"
              v-model="basePath"
              type="text"
              placeholder="file://localhost/Users/you/Music/HiRes"
              :disabled="!hasXml"
            />
          </div>
        </div>

        <div
          class="step export"
          :class="{ disabled: !hasXml || !hasHiRes || !hasMappings }"
          v-if="hasXml || hasHiRes || hasMappings"
        >
          <div class="step-label">Step 4 · Export updated XML</div>
          <p class="muted small">
            Applies new path mappings to your rekordbox.xml file.
          </p>
          <div class="step-actions">
            <button
              class="btn primary"
              :disabled="!canExport()"
              @click="exportUpdatedXml"
            >
              Export updated XML
            </button>
            <span class="micro">
              {{ hasMappings ? `${summary.matched} mapped` : 'Map at least one track' }}
            </span>
          </div>
        </div>
      </div>

      <p v-if="xmlError" class="error">{{ xmlError }}</p>
      <input
        ref="xmlInputRef"
        type="file"
        accept=".xml, text/xml"
        class="hidden"
        @change="onXmlSelected"
      />
      <input
        ref="hiResInputRef"
        type="file"
        webkitdirectory
        multiple
        class="hidden"
        @change="onHiResFilesSelected"
      />
    </header>

    <section class="grid">
      <div class="card pane">
        <div class="pane-header">
          <div>
            <h2>Tracks from Rekordbox</h2>
            <p class="muted">Select a track to map it to a new audio file.</p>
          </div>
          <div class="filters">
            <select v-model="statusFilter" title="Filter by match status">
              <option value="unmatched">Unmatched</option>
              <option value="matched">Matched</option>
              <option value="ignored">Ignored</option>
              <option value="all">All</option>
            </select>
            <select v-model="bitRateFilter" title="Filter by bitrate">
              <option value="all">All bitrates</option>
              <option value="low">≤ 160 kbps</option>
              <option value="mid">161–256 kbps</option>
              <option value="lossyHigh">257–319 kbps</option>
              <option value="high">≥ 320 kbps</option>
            </select>
            <input
              v-model="trackSearch"
              type="search"
              placeholder="Search tracks"
            />
          </div>
        </div>
        <div class="table" role="list">
          <div
            v-for="track in filteredTracks"
            :key="track.id"
            class="row"
            :class="{ active: track.id === activeTrackId }"
            @click="selectTrack(track.id)"
          >
            <div class="status-dot" :data-status="getStatus(track.id)"></div>
            <div class="title-col">
              <div class="title">{{ track.artist }} - {{ track.title }}</div>
              <div class="meta" v-if="track.album">
                <span>{{ track.album }}</span>
              </div>
            </div>
            <div class="numbers">
              <span v-if="track.durationSeconds !== undefined">
                {{ formatDuration(track.durationSeconds) }}
              </span>
              <span v-if="track.bitRate">{{ track.bitRate }} kbps</span>
            </div>
            <div class="row-actions">
              <button class="btn ghost" @click.stop="toggleIgnore(track.id)">
                {{ getStatus(track.id) === 'ignored' ? 'Unignore' : 'Ignore' }}
              </button>
            </div>
          </div>
          <p v-if="!filteredTracks.length" class="muted">No tracks to show.</p>
        </div>
      </div>

      <div class="card pane">
        <div class="pane-header">
          <div>
            <h2>Map to new file</h2>
            <p class="muted">
              Browse your new audio folder and confirm a match for the active
              track.
            </p>
          </div>
        </div>
        <div v-if="!activeTrack" class="muted">
          Select a track to start mapping.
        </div>

        <div v-if="activeTrack && suggestions.length" class="suggestions">
          <div class="suggest-title">
            <p class="muted">Auto-Matched Suggestions</p>
          </div>
          <div class="suggest-list">
            <div
              v-for="item in suggestions"
              :key="item.file.relativePath"
              class="suggest-row"
            >
              <div class="title-col">
                <div class="title">{{ item.file.name }}</div>
              </div>
              <div class="suggest-actions">
                <span class="score-pill" :class="{ full: item.score >= 0.999 }">
                  {{ (item.score * 100).toFixed(0) }}% match
                </span>
                <button class="btn primary" @click="confirmMapping(item.file)">
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="activeTrack" class="muted">
          No auto-suggestions yet for this track.
        </div>

        <div class="suggest-title">
          <p class="muted">Search</p>
        </div>

        <div class="filters">
          <select v-model="extensionFilter">
            <option value="all">All types</option>
            <option value=".flac">.flac</option>
            <option value=".wav">.wav</option>
            <option value=".aiff">.aiff</option>
            <option value=".mp3">.mp3</option>
          </select>
          <input
            v-model="hiResSearch"
            type="search"
            placeholder="Search new files"
          />
        </div>
        <div class="table files" role="list">
          <div
            v-for="item in filteredHiRes"
            :key="item.file.relativePath"
            class="row"
            :class="{ active: item.file.relativePath === selectedHiResPath }"
            @click="selectHiRes(item.file.relativePath)"
            @dblclick="confirmMapping(item.file)"
          >
            <div class="title-col">
              <div class="title">{{ item.file.name }}</div>
              <div class="meta">{{ item.file.relativePath }}</div>
            </div>
            <div
              class="score-pill small"
              :class="{ full: item.score >= 0.999 }"
            >
              {{ (item.score * 100).toFixed(0) }}% match
            </div>
            <div class="row-actions">
              <button class="btn ghost" @click.stop="confirmMapping(item.file)">
                Confirm
              </button>
            </div>
          </div>
          <p v-if="!filteredHiRes.length" class="muted">
            No new audio files loaded yet.
          </p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #e5e7eb;
}

.topbar {
  display: grid;
  gap: 16px;
}

.hero-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-start;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.btn {
  border: 1px solid #1f2937;
  border-radius: 12px;
  padding: 10px 14px;
  background: #191e27;
  cursor: pointer;
  font-weight: 600;
  color: #e5e7eb;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}

.btn:hover:enabled {
  transform: translateY(-1px);
  border-color: #fbbf24;
  box-shadow: 0 12px 40px rgba(251, 191, 36, 0.18);
}

.btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.btn.primary {
  background: linear-gradient(135deg, #f59e0b, #a855f7);
  color: white;
  border: none;
}

.btn.ghost {
  background: #2e353e;
  border-color: #1f2937;
  box-shadow: none;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pill {
  background: #2e353e;
  color: #e5e7eb;
  padding: 6px 12px;
  border-radius: 12px;
  font-weight: 600;
}

.steps {
  display: grid;
  gap: 12px;
}

.step {
  border: 1px solid #1f2937;
  border-radius: 12px;
  padding: 12px 14px;
  background: #1c1f27;
  display: grid;
  gap: 6px;
}

.step.ready {
  border-color: #fbbf24;
}

.step.disabled {
  opacity: 0.7;
}

.step-label {
  font-weight: 700;
  color: #e5e7eb;
}

.step-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.micro {
  color: #9ca3af;
  font-size: 13px;
}

.base-path {
  display: grid;
  gap: 6px;
}

.base-path input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #1f2937;
  background: #2e353e;
  color: #e5e7eb;
  font-size: 15px;
}

.base-path small {
  color: #9ca3af;
}

.small {
  font-size: 14px;
}

.export-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.status {
  color: #9ca3af;
}

.divider {
  margin: 0 6px;
  color: #1f2937;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 16px;
}

.pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pane-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filters input,
.filters select {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #1f2937;
  background: #2e353e;
  color: #e5e7eb;
}

.table {
  border: 1px solid #1f2937;
  border-radius: 14px;
  overflow: hidden;
  background: #2e353e;
}

.table.files {
  max-height: 460px;
  overflow-y: auto;
}

.table.files .row {
  grid-template-columns: 1fr auto auto;
}

.row {
  display: grid;
  grid-template-columns: 1em 1fr 90px 50px;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #1f2937;
  background: #191e27;
}

.table .row:last-of-type {
  border-bottom: none;
}

.row.active {
  background: linear-gradient(90deg,rgba(21, 196, 255, 0.388), rgba(16, 163, 255, 0.12));
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #1f2937;
}

.status-dot[data-status='matched'] {
  background: #22c55e;
}

.status-dot[data-status='ignored'] {
  background: #6b7280;
}

.title-col {
  display: grid;
  gap: 4px;
}

.title {
  font-weight: 700;
  color: #e5e7eb;
}

.meta {
  color: #9ca3af;
  font-size: 14px;
}

.score-pill {
  background: #4b5563;
  color: white;
  padding: 6px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 13px;
  justify-self: center;
}

.score-pill.full {
  background: #0a8939;
}

.score-pill.small {
  background: #191e27;
}

.path {
  color: #cbd5e1;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.numbers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #cbd5e1;
  font-size: 13px;
}

.row-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.mapping-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #1f2937;
  border-radius: 10px;
  background: #2e353e;
  color: #e5e7eb;
}

.muted {
  color: #9ca3af;
}

.error {
  color: #dc2626;
  font-weight: 600;
}

.hidden {
  display: none;
}

.suggestions {
  border-radius: 12px;
}

.suggest-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.suggest-list {
  display: grid;
  gap: 8px;
}

.suggest-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  background: #191e27;
  border: 1px solid #1f2937;
}

.suggest-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 860px) {
  .row {
    grid-template-columns: auto 1fr;
  }

  .path,
  .numbers,
  .row-actions {
    grid-column: span 2;
  }

  .filters {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
