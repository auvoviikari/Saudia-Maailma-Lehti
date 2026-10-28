# Saudia & Maailma Lehti (SML)

Uutissivusto. Julkiset sivut (`index.html`, `article.html`) vain *lukevat* tiedostoa `news.json` – kukaan vierailija ei voi muuttaa mitään.

## Uutisen lisääminen
1. Avaa sivustolta `admin.html`.
2. Kirjaudu GitHub-tokenilla (Fine-grained token, vain tämä repo, oikeus **Contents: Read and write**).
3. Täytä lomake ja paina **Julkaise**. Uutinen näkyy sivulla noin minuutin kuluttua.

## Julkaisu
Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
Sivusto: https://auvoviikari.github.io/Saudia-Maailma-Lehti/ (isot kirjaimet ovat tärkeitä)

## Kommentit

Lukijat voivat kommentoida uutisia valitsemallaan nimimerkillä. Kommentit tallennetaan
ilmaiseen Firebase-tietokantaan. Käyttöönotto (kerran):

1. Mene osoitteeseen https://console.firebase.google.com ja luo uusi projekti
   (esim. `sml-lehti`). Google Analyticsia ei tarvita.
2. **Build → Firestore Database → Create database** → valitse sijainti (esim. `europe-north1`)
   → *Start in production mode*.
3. **Build → Authentication → Get started → Email/Password** → ota käyttöön.
   Välilehdeltä **Users → Add user** lisää oma sähköpostisi ja salasana.
   Kopioi käyttäjän **User UID**.
4. **Firestore Database → Rules**: liitä tiedoston `firestore.rules` sisältö, vaihda
   `OMA_UID` kohdan 3 UID:ksi ja paina **Publish**.
5. **Project settings (rataskuvake) → General → Your apps → Web (`</>`)** → rekisteröi
   sovellus. Kopioi näkyvä `firebaseConfig` ja liitä se tiedostoon `comments-config.js`
   muodossa `window.SML_FIREBASE = { ... };`
6. **Authentication → Settings → Authorized domains**: varmista että
   `auvoviikari.github.io` on listalla.

Kommentteja voi poistaa admin-sivun **Kommentit**-osiosta kirjautumalla kohdan 3 tunnuksella.
