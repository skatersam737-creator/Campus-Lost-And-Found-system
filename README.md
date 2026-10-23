# CampusFind — Lost & Found Website

CampusFind is a full-stack college project built with HTML, CSS, browser JavaScript, Node.js, Express and SQLite.

## What works in this project

- Create an account, log in and log out
- Publish lost-item and found-item reports
- Upload an optional item photo (JPG, PNG, WEBP or GIF, up to 3 MB)
- Search reports and filter Lost / Found
- Store accounts and reports in a SQLite database
- View reports you submitted
- Get rule-based possible matches using shared words, category and location
- Mark your own reports as returned (admin can also do this)

**Note:** matching is a transparent rule-based prototype, not trained AI. This is a college-project starter, not yet a hardened production service.

## Run on Windows (beginner steps)

1. Install Node.js LTS from https://nodejs.org/ if you have not already.
2. Extract this ZIP.
3. In VS Code, open the extracted `CampusFind_Ready` folder (the one containing `package.json` and `server.js`).
4. Choose **Terminal → New Terminal**.
5. Install dependencies:

   ```powershell
   npm.cmd install
   ```

   `npm.cmd` avoids the PowerShell script-policy error that can happen with `npm`.

6. Start the website:

   ```powershell
   npm.cmd start
   ```

7. Keep the terminal open and visit http://localhost:3000 in your browser.

To stop the server, focus the terminal and press `Ctrl+C`.

## Demo account

- Email: `demo@campusfind.local`
- Password: `DemoPass123!`

Or create your own account using **Login / Sign up**.

## Project structure

```text
CampusFind_Ready/
├── server.js
├── package.json
├── package-lock.json
├── .gitignore
├── .env.example
├── README.md
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

The `campusfind.db` database and `uploads/` folder are created when the server runs. They are deliberately not included in this ZIP so you start with a clean local database.

## Before putting it online for real users

The app needs hosting that can run Node.js (GitHub Pages alone cannot run `server.js`). For a public deployment:

- Set `NODE_ENV=production`.
- Set `SESSION_SECRET` to a long, random secret in the host's environment settings. Never commit secrets to GitHub.
- Use a host with persistent storage for both the SQLite database and uploaded images, or migrate to a managed database and object/file storage. Ephemeral filesystems can lose uploaded reports and images after redeploy/restart.
- Configure HTTPS, rate limiting, moderation/reporting, backups and a persistent session store before real campus use.
- Do not upload sensitive ID-card images or personal details in a classroom demo.

## Troubleshooting

- **PowerShell says scripts are disabled:** run `npm.cmd install` and `npm.cmd start`, not `npm start`.
- **`localhost:3000` refuses connection:** check that the terminal still shows `CampusFind is running at http://localhost:3000`. If the process stopped or printed an error, fix that terminal error first.
- **Port 3000 is already in use:** stop the other server with `Ctrl+C`, or set a different `PORT` environment variable.
