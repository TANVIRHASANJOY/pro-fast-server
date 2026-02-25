require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Stripe initialization using secret key from .env
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: ["http://localhost:5173"], credentials: true }));
app.use(express.json());

// MongoDB Connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gdayzte.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    
    const db = client.db("parcelDB");
    const parcelCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments"); // Payment history collection

    // --- PARCEL ROUTES ---

    // 1. Create Parcel (Initial state: pending & unpaid)
    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      parcel.status = "pending";
      parcel.payment_status = "unpaid"; 
      const result = await parcelCollection.insertOne(parcel);
      res.send(result);
    });

    // 2. Get Parcels (Filter by user email)
    app.get("/parcels", async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) query = { email: email }; 
      const result = await parcelCollection.find(query).toArray();
      res.send(result);
    });

    // 3. Get Single Parcel (Required for checkout page details)
    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const result = await parcelCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // 4. Update Parcel Info (Edit)
    app.patch("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { ...req.body } };
      const result = await parcelCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // 5. Delete Parcel
    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });


    // --- PAYMENT & STRIPE ROUTES ---

    // 6. Create Stripe Payment Intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      if (!price || price <= 0) return res.status(400).send({ message: "Invalid Price" });
      
      const amount = Math.round(price * 100); // Stripe handles cents (100 cents = 1 USD/BDT)

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // 7. Save Payment to DB & Update Parcel Status
    // Flow: Success confirm hole frontend theke ekhane request ashbe
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      
      // A. Save info to payments collection
      const paymentResult = await paymentCollection.insertOne(payment);

      // B. Update status in parcels collection
      const query = { _id: new ObjectId(payment.parcelId) };
      const updatedDoc = {
        $set: {
          payment_status: "paid",
          status: "booked", // Changing status from pending to booked
          transactionId: payment.transactionId
        }
      };
      
      const updateResult = await parcelCollection.updateOne(query, updatedDoc);

      res.send({ paymentResult, updateResult });
    });

    // 8. Get Payment History for a User
    app.get("/payment-history", async (req, res) => {
        const email = req.query.email;
        if (!email) return res.status(403).send({ message: "Forbidden Access" });
        const query = { email: email };
        const result = await paymentCollection.find(query).toArray();
        res.send(result);
    });

    console.log("✅ Connected to MongoDB successfully!");
  } catch (err) { 
    console.error("❌ MongoDB Connection Error:", err); 
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Pro-Fast Server is Running"));

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});