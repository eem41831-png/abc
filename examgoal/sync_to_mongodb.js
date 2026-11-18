// sync_to_mongodb.js - One-click script to push extracted questions to MongoDB Atlas
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const MONGO_URI = "mongodb+srv://eem41831_db_user:iyqvtKvKRlJuMtVs@cluster0.o1b2ccj.mongodb.net/?retryWrites=true&w=majority";

async function sync() {
    const jsonPath = path.resolve(__dirname, '..', 'examgoal_questions', 'organic_chemistry_100_questions.json');
    if (!fs.existsSync(jsonPath)) {
        console.error("Questions file not found at:", jsonPath);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`Loaded ${data.length} questions from local file.`);
    console.log("Connecting to MongoDB Atlas at cluster0.o1b2ccj.mongodb.net...");

    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        console.log("Successfully connected to MongoDB Atlas!");
        const db = client.db("examgoal");
        const coll = db.collection("questions");

        // Remove old questions to avoid duplication if re-syncing
        await coll.deleteMany({});
        const res = await coll.insertMany(data);
        console.log(`\n>> Successfully inserted ${res.insertedCount} questions into MongoDB database 'examgoal', collection 'questions'!`);
    } catch (e) {
        console.error("\nConnection failed:", e.message);
        console.log("\nTIP: Make sure you have whitelisted your IP in MongoDB Atlas:");
        console.log("1. Open MongoDB Atlas (cloud.mongodb.com)");
        console.log("2. Go to 'Security' -> 'Network Access'");
        console.log("3. Click 'Add IP Address' -> Select 'Allow Access from Anywhere' (0.0.0.0/0) or add your current IP.");
    } finally {
        await client.close();
    }
}

sync();
