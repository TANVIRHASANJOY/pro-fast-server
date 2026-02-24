require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: ["http://localhost:5173"], credentials: true }));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gdayzte.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    await client.connect();
    const parcelCollection = client.db("parcelDB").collection("parcels");

    // 1. Create Parcel
    app.post("/parcels", async (req, res) => {
      const result = await parcelCollection.insertOne(req.body);
      res.send(result);
    });

    // 2. Get Parcels (Filter by email if provided)
    app.get("/parcels", async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) query = { senderEmail: email };
      const result = await parcelCollection.find(query).toArray();
      res.send(result);
    });

    // 3. Update Parcel
    app.patch("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { ...req.body } };
      const result = await parcelCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // 4. Delete Parcel
    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    console.log("✅ Connected to MongoDB");
  } catch (err) { console.error(err); }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Pro-Fast Server Running"));
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));