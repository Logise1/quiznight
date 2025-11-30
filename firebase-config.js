import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = { databaseURL: "https://party-e2086-default-rtdb.europe-west1.firebasedatabase.app/" };
const appFirebase = initializeApp(firebaseConfig);
const db = getDatabase(appFirebase);

export { db, ref, set, get, update, onValue };
