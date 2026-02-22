# Acoustic Data Link

A browser-based acoustic data transmission app that enables devices to transmit data to each other using only sound (speakers and microphones).

**Visual Metaphor**: "Deep Space Digital Radio". The interface borrows elements from high-frequency radio dashboards and cryptography terminals, employing an immersive animated aurora background with dark, glass-morphic hardware telemetry panels, a fixed primary green accent for optimal visual contrast, and decrypted text animations. 

*Developed by Asmith — asmyth@duck.com*

## Features (Phase 1: Frontend Architecture)
- **Role Selection:** Toggle instantly between Transmitter and Receiver dashboards.
- **Transmitter Dashboard:** Mock configurations for FSK encoding profiles, bitrate targets, and redundancy levels, with full aesthetic waveform telemetry.
- **Receiver Dashboard:** Mock listening states, ambient audio spectrum visualization, and signal decoding console logs.
- **Kinetic UI:** Smooth transitions and reactive elements via Framer Motion. 
- **Anti-Gravity Architecture:** Full `prefers-reduced-motion` accessibility support, API fallback override mockups, and strict React state separation.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
1. Clone the repository
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
3. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

## Deployment Guide

### GitHub Pages (Automated)
This repository includes a GitHub Action for deploying natively to GitHub Pages.
1. Push your code to the \`main\` branch.
2. In your repository settings:
   - Go to **Settings** > **Pages**.
   - Set the source to **GitHub Actions**.
3. *Phase 2 Only:* Add \`VITE_API_KEY\` to your Repository Secrets if the AI summarization fallback is necessary.

### Netlify Deployment
1. Connect your repository to Netlify.
2. The included \`netlify.toml\` handles the build command (\`npm run build\`) and SPA routing redirects automatically.
3. *Phase 2 Only:* Add the \`VITE_API_KEY\` environment variable in the Netlify site settings.

## API Override System
To protect production stability and reduce quota exhaustion, an Override System is implemented. If the backend services experience rate-limiting (`429`) or a key expiration, the UI intercepts the error and displays a modal.
Users can input their own Google SDK API keys dynamically to bypass the server limitations and continue transmitting data.

---
> Note: Replace the default Vite favicon in `public/` to match the radio/acoustic transmission metaphor.
