import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(
  fs.readFileSync("./firebase-service-account.json", "utf8")
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function test() {
  try {
    const snap = await db.collection("issues").limit(1).get();
    console.log("OK, Firestore merge. Docs:", snap.size);
  } catch (err) {
    console.error("Firestore test error:", err);
  }
}

test();
