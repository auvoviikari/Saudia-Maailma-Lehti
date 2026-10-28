# Saudia & Maailma Lehti (SML)

Uutissivusto. Julkiset sivut (`index.html`, `article.html`) vain *lukevat* tiedostoa `news.json` – kukaan vierailija ei voi muuttaa mitään.

## Uutisen lisääminen
1. Avaa sivustolta `admin.html`.
2. Kirjaudu GitHub-tokenilla (Fine-grained token, vain tämä repo, oikeus **Contents: Read and write**).
3. Täytä lomake ja paina **Julkaise**. Uutinen näkyy sivulla noin minuutin kuluttua.

## Kuvat ja videot jutun sisällä
Admin-sivulla "+ Kuva", "+ Video" ja "+ YouTube-linkki" lisäävät tekstiin merkin `[media 1]`,
`[media 2]` jne. Kuva tai video näkyy jutussa merkin kohdalla, ja jokaiselle voi kirjoittaa
kuvatekstin. Videot voivat olla enintään 25 Mt (MP4, WebM tai MOV); isommat kannattaa
laittaa YouTubeen ja lisätä linkkinä.

## Jakaminen, haku ja luetuimmat
- Jokaisella uutisella on oma sivunsa `uutiset/<id>.html`, jonka admin-sivu tekee
  julkaistaessa. Siinä on linkin esikatselutiedot (otsikko, ingressi, kuva), jotka
  WhatsApp, Discord, Instagram ym. näyttävät linkkiä jaettaessa. Kuvattomille uutisille
  käytetään kuvaa `og-image.png`.
- Hakukenttä valikossa hakee otsikoista, ingresseistä ja tekstistä.
- "Luetuimmat"-lista laskee lukukerrat Firebaseen (sama projekti kuin kommenteilla).
  Sama selain lasketaan kerran päivässä per uutinen.

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
