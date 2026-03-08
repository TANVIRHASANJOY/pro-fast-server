require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// =========================
// Middleware
// =========================
app.use(
  cors({
    origin: [
      "http://localhost:5173", 
      "https://pro-fast-87db5.web.app",
      "https://pro-fast-server-zeta.vercel.app"
    ],
    credentials: true,
  })
);
app.use(express.json());

// =========================
// MongoDB Setup
// =========================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gdayzte.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);
const db = client.db("parcelDB");

// Collections
const usersCollection = db.collection("users");
const parcelCollection = db.collection("parcels");
const paymentCollection = db.collection("payments");
const ridersCollection = db.collection("riders");
const cashoutCollection = db.collection("cashouts");

// =========================
// Root route
// =========================
app.get("/", (req, res) => {
  res.send("🚀 Pro Fast Server Running");
});

// =========================
// USERS ROUTES
// =========================
app.put("/users", async (req, res) => {
  try {
    const user = req.body;
    const filter = { email: user.email };
    const updateDoc = {
      $set: {
        name: user.name,
        email: user.email,
        role: user.role || "user",
        createdAt: user.createdAt || new Date(),
      },
    };
    const result = await usersCollection.updateOne(filter, updateDoc, { upsert: true });
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/users", async (req, res) => {
  try {
    const result = await usersCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/users/:email", async (req, res) => {
  try {
    const user = await usersCollection.findOne({ email: req.params.email });
    res.send(user);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/users/rider/:email", async (req, res) => {
  try {
    const user = await usersCollection.findOne({ email: req.params.email });
    res.send({ rider: user?.role === "rider" });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.patch("/users/:id", async (req, res) => {
  try {
    const { role } = req.body;
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role } }
    );
    res.send({ success: true, result });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// =========================
// RIDERS ROUTES
// =========================
app.post("/riders", async (req, res) => {
  try {
    const rider = { ...req.body, status: "pending", role: "rider", createdAt: new Date() };
    const result = await ridersCollection.insertOne(rider);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/riders", async (req, res) => {
  try {
    const status = req.query.status;
    const filter = status ? { status } : {};
    const result = await ridersCollection.find(filter).sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/riders/:email", async (req, res) => {
  try {
    const rider = await ridersCollection.findOne({ email: req.params.email });
    res.send(rider);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.patch("/riders/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const riderResult = await ridersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status } }
    );

    if (status === "approved") {
      const rider = await ridersCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (rider?.email)
        await usersCollection.updateOne({ email: rider.email }, { $set: { role: "rider" } });
    }

    res.send({ success: true, riderResult });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// =========================
// PARCEL ROUTES
// =========================
app.post("/parcels", async (req, res) => {
  try {
    const parcel = { ...req.body, status: "pending", payment_status: "unpaid", createdAt: new Date() };
    const result = await parcelCollection.insertOne(parcel);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/parcels", async (req, res) => {
  try {
    const filter = req.query.email ? { email: req.query.email } : {};
    const result = await parcelCollection.find(filter).sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/parcels/:id", async (req, res) => {
  try {
    const parcel = await parcelCollection.findOne({ _id: new ObjectId(req.params.id) });
    res.send(parcel);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.patch("/parcels/:id", async (req, res) => {
  try {
    const result = await parcelCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.delete("/parcels/:id", async (req, res) => {
  try {
    const result = await parcelCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// =========================
// ASSIGN RIDER
// =========================
app.patch("/assign-rider/:id", async (req, res) => {
  try {
    const { riderEmail } = req.body;
    const result = await parcelCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { riderEmail, status: "picked", pickedAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// =========================
// RIDER PARCELS
// =========================
app.get("/rider-parcels", async (req, res) => {
  try {
    const result = await parcelCollection.find({ riderEmail: req.query.email, status: "picked" }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// =========================
// DELIVER PARCEL
// =========================
app.patch("/parcel-delivered/:id", async (req, res) => {
  try {
    const result = await parcelCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: "delivered", deliveredAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// =========================
// RIDER COMPLETED DELIVERIES
// =========================
app.get("/rider/completed-deliveries/:email", async (req, res) => {
  try {
    const result = await parcelCollection
      .find({ riderEmail: req.params.email, status: "delivered" })
      .sort({ deliveredAt: -1 })
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// =========================
// CASHOUT
// =========================
app.post("/cashout", async (req, res) => {
  try {
    const { email, amount } = req.body;
    const cashout = { email, amount, status: "pending", createdAt: new Date() };
    const result = await cashoutCollection.insertOne(cashout);
    res.send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/cashout/:email", async (req, res) => {
  try {
    const result = await cashoutCollection.find({ email: req.params.email }).sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// =========================
// PAYMENT
// =========================
app.post("/create-payment-intent", async (req, res) => {
  try {
    const amount = Math.round(req.body.price * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card"],
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post("/payments", async (req, res) => {
  try {
    const payment = req.body;
    const paymentResult = await paymentCollection.insertOne(payment);
    await parcelCollection.updateOne(
      { _id: new ObjectId(payment.parcelId) },
      { $set: { payment_status: "paid", transactionId: payment.transactionId } }
    );
    res.send(paymentResult);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/payment-history", async (req, res) => {
  try {
    const result = await paymentCollection.find({ email: req.query.email }).sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// =========================
// Connect MongoDB once
// =========================
client.connect()
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// =========================
// Export app for Vercel
// =========================
module.exports = app;