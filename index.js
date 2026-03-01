require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gdayzte.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("parcelDB");

    // Collections
    const usersCollection = db.collection("users");
    const parcelCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    const ridersCollection = db.collection("riders");

    // =========================
    // USERS ROUTES
    // =========================

    // Create / Update user (Upsert)
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
        const options = { upsert: true };
        const result = await usersCollection.updateOne(filter, updateDoc, options);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Get all users
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Get single user by email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // =========================
    // RIDERS ROUTES
    // =========================

    // Create rider application
    app.post("/riders", async (req, res) => {
      try {
        const rider = req.body;
        const newRider = {
          ...rider,
          status: "pending", // default
          role: "rider",
          createdAt: new Date(),
        };
        const result = await ridersCollection.insertOne(newRider);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Get all riders (admin)
    app.get("/riders", async (req, res) => {
      const status = req.query.status; // optional query: pending/approved
      const filter = status ? { status } : {};
      const result = await ridersCollection.find(filter).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // Get single rider by email
    app.get("/riders/:email", async (req, res) => {
      const email = req.params.email;
      const result = await ridersCollection.findOne({ email });
      res.send(result);
    });

    // Approve rider
    app.patch("/riders/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // status = 'approved' or 'rejected'
        const result = await ridersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // =========================
    // PARCEL ROUTES
    // =========================

    // Create parcel
    app.post("/parcels", async (req, res) => {
      try {
        const parcel = { ...req.body, status: "pending", payment_status: "unpaid", createdAt: new Date() };
        const result = await parcelCollection.insertOne(parcel);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Get parcels (optional email query)
    app.get("/parcels", async (req, res) => {
      const email = req.query.email;
      const filter = email ? { email } : {};
      const result = await parcelCollection.find(filter).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // Get single parcel
    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const result = await parcelCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Update parcel
    app.patch("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const result = await parcelCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );
      res.send(result);
    });

    // Delete parcel
    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // =========================
    // PAYMENT ROUTES
    // =========================

    // Create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;
        const amount = Math.round(price * 100);
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

    // Save payment and update parcel
    app.post("/payments", async (req, res) => {
      try {
        const payment = req.body;
        const paymentResult = await paymentCollection.insertOne(payment);

        await parcelCollection.updateOne(
          { _id: new ObjectId(payment.parcelId) },
          {
            $set: {
              payment_status: "paid",
              status: "booked",
              transactionId: payment.transactionId,
            },
          }
        );

        res.send(paymentResult);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // Payment history by email
    app.get("/payment-history", async (req, res) => {
      const email = req.query.email;
      const result = await paymentCollection.find({ email }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Error:", error);
  }
}

run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
  res.send("🚀 Pro Fast Server Running");
});

// Listen
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});