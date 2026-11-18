const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://eem41831_db_user:iyqvtKvKRlJuMtVs@cluster0.o1b2ccj.mongodb.net/?retryWrites=true&w=majority";

async function testMongo() {
    const client = new MongoClient(uri);
    try {
        console.log("Connecting to MongoDB Atlas...");
        await client.connect();
        console.log("Successfully connected to MongoDB!");
        const dbs = await client.db().admin().listDatabases();
        console.log("Databases:", dbs.databases.map(d => d.name));
    } catch (e) {
        console.error("MongoDB Connection Error:", e.message);
    } finally {
        await client.close();
    }
}

testMongo();
