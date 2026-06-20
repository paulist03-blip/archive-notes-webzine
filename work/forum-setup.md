# Paul Archive Notes Forum Setup

This forum is wired for Firebase Authentication and Cloud Firestore.

## 1. Firebase console

1. Create a Firebase project.
2. Add a Web app.
3. Enable Authentication > Email/Password.
4. Create a Firestore database in production mode.

## 2. Site config

Fill `assets/forum-config.js`:

```js
window.PAN_FORUM_CONFIG = {
  adminEmail: "YOUR_ADMIN_EMAIL",
  firebase: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    appId: "..."
  }
};
```

## 3. Firestore rules

Replace `YOUR_ADMIN_EMAIL` in `work/firestore.rules` with the same owner email, then publish the rules in Firebase.

The rules allow:

- Anyone can read forum posts.
- Only signed-in users can create posts.
- Only the admin email can pin or delete posts.
