# Rekordbox XML Editor

Swap out files within your Rekordbox library. This browser app reads your `rekordbox.xml`, lets you select a track, then select a new file to map it to. Once your tracks are re-mapped, you can export an updated XML library and re-import it into Rekordbox.

Everything happens in your browser; nothing is uploaded.

## Use it online (easiest)
1) Go to the GitHub Pages site for this repo: `https://<your-username>.github.io/rekordbox-xml-editor/` (replace `<your-username>` with the account that hosts the repo).  
2) Click **Choose rekordbox.xml** and pick your exported file.  
3) Click **Select folder with new audio files** and point to the new library you want Rekordbox to use.  
4) Enter the base path exactly how Rekordbox should see it (for example `file://localhost/Users/you/Music/HiRes`).  
5) Confirm matches for your tracks, then click **Export updated XML**. Import that XML back into Rekordbox and your tracks should point to the new files.

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
