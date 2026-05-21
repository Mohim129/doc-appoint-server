const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
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
    const db = client.db("docappoint");
    const doctorsCollection = db.collection("doctors");
    const appointmentsCollection = db.collection("appointments");
    const usersCollection = db.collection("users");

    app.get("/doctors", async (req, res) => {
      const doctors = await doctorsCollection.find({}).toArray();
      res.json(doctors);
    });

    app.get("/doctors/search", async (req, res) => {
      const query = req.query;
      console.log(query);
      const doctors = await doctorsCollection.find(query).toArray();
      res.json(doctors);
    });

    app.get("/appointments", async (req, res) => {
      const query = req.query;
      const appointments = await appointmentsCollection.find(query).toArray();
      res.json(appointments);
    });

    app.get("/users", async (req, res) => {
      const query = req.query;
      const users = await usersCollection.find(query).toArray();
      res.json(users);
    });

    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await appointmentsCollection.insertOne(appointment);
      res.json(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.json(result);
    });

    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const appointment = req.body;
      const result = await appointmentsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: appointment }
      );
      res.json(result);
    });

    app.put("/users/:id", async (req, res) => {
      const id = req.params.id;
      const user = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: user }
      );
      res.json(result);
    });

    app.delete("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const result = await appointmentsCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });


    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

run();