# Rekordbox XML Editor

Point your Rekordbox library at new audio files without losing your cue points, metadata, etc. This browser app reads your `rekordbox.xml`, matches tracks to new files (hi-res upgrades, cleaned edits, etc.), and keeps your cues, grids, playlists, and other metadata intact—no rebuilding from scratch. Export the updated XML and re-import it to seamlessly swap low-quality files for better versions. Note: `My Tag` meta data is NOT retained, so new tracks will have to be re-tagged.

### Notes
- This process leaves orginal tracks in place as well, so you will have duplicates.
- Everything happens in your browser so it's private, secure, and nothing is uploaded.

### Disclaimer
Be careful when using this. Always back up your entire library before using tools like these. This is provided as freeware with no warranty or support of any kind. If your library gets messed up, you're on your own - so proceed with caution!

## Use it online (easiest)
1) Go to `https://jeffjassky.github.io/rekordbox-utils/`
2) Click **Choose rekordbox.xml** and pick your exported file.  
3) Click **Select folder with new audio files** and point to the new library you want Rekordbox to use.  
4) Enter the base path exactly how Rekordbox should see it (for example `file://localhost/Users/you/Music/HiRes`).  
5) Confirm matches for your tracks, then click **Export updated XML**.

### To import your new XML file
1) Proceeed with caution! Back up your entire library at least once before proceeding.
2) In Rekordbox go to preferences > advanced > rekordbox XML and select your new XML file.
3) In the library/playlist selector, select 'Display Rekordbox XML'.
4) Right-click `Playlists` and select `Import Playlists`. It will warn you that your playlists will be overwritten. This is normal - it will update all of your playlsts to use the new tracks.



## Run it locally
1) Clone the repo: `git clone https://github.com/<your-username>/rekordbox-xml-editor.git`  
2) Install dependencies (Node 20+ recommended): `yarn install`  
3) Start the app: `yarn dev`  
4) Open the local URL from the terminal output (defaults to `http://localhost:5173`).  
5) Use it the same way as the online version: load `rekordbox.xml`, pick the folder with your new media, set the base path, map tracks, export the new XML.

## For developers
- Tech stack: Vue 3, TypeScript, Vite.  
- Build for GitHub Pages with the same base path used in CI: `VITE_BASE=/rekordbox-xml-editor/ yarn build` (outputs to `dist`).  
- Preview a production build: `yarn preview`.  
- Issues and pull requests are welcome—keep language simple for DJs and avoid adding server components since the app is meant to run fully in the browser.  
- Please lint/format with your editor defaults and keep dependencies minimal; this project intentionally stays lightweight for quick offline use.
