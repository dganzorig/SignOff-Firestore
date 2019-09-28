const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp(functions.config().firebase);

let db = admin.firestore();

// This is the single document instance
let popularityParamsRef = db.collection("PopularityParameters").doc("NhaJD2HJZfHGrohUSpzm");

// This is a collection instance
let suggestionsRef = db.collection("Suggestions");

// Formula for giving a popularity score that factors in time decay
const calculatePopularity = (likes, daysPassed, offset, gravity) => {
  const result = likes / Math.pow((daysPassed + offset), gravity);
  return result;
}

const daysPassed = before => {
  const result = (Date.now() - before) / (1000 * 60 * 60 * 24);
  return result;
}

// Get the most up-to-date popularity params
const getPopularityParams = async () => {
  return popularityParamsRef.get().then(params => {
    let offset = params.data().timeOffset;
    let gravity = params.data().gravity;
    return [offset, gravity]
  });
}

exports.onPopularityParamsChange = functions.firestore
  .document("PopularityParameters/NhaJD2HJZfHGrohUSpzm")
  .onUpdate(async (change, context) => {
    let timeOffset = change.after.data().timeOffset;
    let gravity = change.after.data().gravity

    return suggestionsRef.get().then(querySnapshot => {
      let promises = []
      querySnapshot.forEach(doc => {
        let likes = doc.data().likes;
        let dateCreated = doc.data().dateCreated.toDate();
        const passedDays = daysPassed(dateCreated);
        const calculatedPopularity = calculatePopularity(likes, passedDays, timeOffset, gravity);
        let result = suggestionsRef.doc(doc.id).update({ popularity: calculatedPopularity });
        promises.push(result)
      });
      return Promise.all(promises);
    });
  });

exports.onSuggestionWritten = functions.firestore
  .document("Suggestions/{docId}")
  .onWrite(async (change, context) => {

    // ignore if it's just popularity that's being updated (to avoid infinite calls)
    let likesBefore = change.before.data().likes;
    let dateCreatedBefore = change.before.data().dateCreated;

    let likesAfter = change.after.data().likes;
    let dateCreatedAfter = change.after.data().dateCreated;

    // so only execute in the case that popularity score SHOULD change
    if (!((likesBefore === likesAfter) && (dateCreatedBefore.isEqual(dateCreatedAfter)))) {
      let popularityParams = await getPopularityParams();
      let likes = change.after.data().likes;
      let dateCreated = change.after.data().dateCreated.toDate();
      const passedDays = daysPassed(dateCreated);
      const calculatedPopularity = calculatePopularity(likes, passedDays, popularityParams[0], popularityParams[1]);
      return suggestionsRef.doc(context.params.docId).update({ popularity: calculatedPopularity });
    }
    return null;
  });
