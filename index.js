require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 5000;

// =========================
// Middleware
// =========================
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

// =========================
// MongoDB Setup
// =========================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gdayzte.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("parcelDB");

    const usersCollection = db.collection("users");
    const parcelCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");
    const ridersCollection = db.collection("riders");
    const cashoutCollection = db.collection("cashouts");

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
        const options = { upsert: true };
        const result = await usersCollection.updateOne(filter, updateDoc, options);
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
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send(user);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.get("/users/rider/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send({ rider: user?.role === "rider" });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.patch("/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;
        if (!role) return res.status(400).send({ error: "Role is required" });

        const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role } });
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
        const rider = req.body;
        const newRider = { ...rider, status: "pending", role: "rider", createdAt: new Date() };
        const result = await ridersCollection.insertOne(newRider);
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
        const email = req.params.email;
        const rider = await ridersCollection.findOne({ email });
        res.send(rider);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.patch("/riders/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const riderResult = await ridersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status } });

        if (status === "approved") {
          const rider = await ridersCollection.findOne({ _id: new ObjectId(id) });
          if (rider?.email) await usersCollection.updateOne({ email: rider.email }, { $set: { role: "rider" } });
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
        const email = req.query.email;
        const filter = email ? { email } : {};
        const result = await parcelCollection.find(filter).sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.get("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const parcel = await parcelCollection.findOne({ _id: new ObjectId(id) });
        res.send(parcel);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.patch("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await parcelCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.delete("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });
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
        const id = req.params.id;
        const { riderEmail } = req.body;
        const result = await parcelCollection.updateOne(
          { _id: new ObjectId(id) },
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
        const email = req.query.email;
        const result = await parcelCollection.find({ riderEmail: email, status: "picked" }).toArray();
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
        const id = req.params.id;
        const result = await parcelCollection.updateOne(
          { _id: new ObjectId(id) },
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
        const email = req.params.email;
        const result = await parcelCollection
          .find({ riderEmail: email, status: "delivered" })
          .sort({ deliveredAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // =========================
    // CASHOUT ROUTE
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
        const email = req.params.email;
        const result = await cashoutCollection.find({ email }).sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // =========================
    // PAYMENT ROUTES
    // =========================
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
        const email = req.query.email;
        const result = await paymentCollection.find({ email }).sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
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

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));