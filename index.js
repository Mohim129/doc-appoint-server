const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ----------- Middleware -----------
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ----------- JWT Verification -----------
const verifyToken = async (req, res, next) => {
  let token = null;

  // 1. Try Authorization header (from server components / fetch calls)
  const authHeader = req.headers.authorization;
  console.log('Incoming Authorization Header:', authHeader);

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Try Better Auth session cookies
  console.log('Incoming Cookies:', req.cookies);
  if (!token) {
    token =
      req.cookies?.['better-auth.session_data'] ||
      req.cookies?.['better-auth.session_token'];
  }

  console.log('Resolved Token:', token);

  if (!token) {
    console.log('No token found in request.');
    return res.status(401).json({ message: 'Unauthorized: Missing session token' });
  }

  // 3. Try verifying the token as a JWT
  try {
    const decoded = jwt.verify(token, process.env.BETTER_AUTH_SECRET);
    console.log('JWT Verification Succeeded:', decoded);
    // Better Auth JWT payload holds the user info in the 'user' field
    req.user = decoded.user || decoded;
    return next();
  } catch (error) {
    console.log('JWT Verification Failed, error:', error.message);
    console.log('Falling back to database session lookup...');

    // 4. Fallback: If it's not a valid JWT (like an opaque session token), query MongoDB
    try {
      const db = client.db("docappoint");
      // Check both "session" (singular) and "sessions" (plural)
      const session = await db.collection("session").findOne({ token }) ||
        await db.collection("sessions").findOne({ token });

      console.log('Database Session lookup result:', session);

      if (session) {
        // Verify session is not expired
        const isExpired = new Date(session.expiresAt) <= new Date();
        console.log('Is Database Session Expired?', isExpired);

        if (!isExpired) {
          // Check both "user" (singular) and "users" (plural)
          const user = await db.collection("user").findOne({
            $or: [
              { id: session.userId },
              { _id: session.userId },
              { _id: ObjectId.isValid(session.userId) ? new ObjectId(session.userId) : null }
            ].filter(Boolean)
          }) || await db.collection("users").findOne({
            $or: [
              { id: session.userId },
              { _id: session.userId },
              { _id: ObjectId.isValid(session.userId) ? new ObjectId(session.userId) : null }
            ].filter(Boolean)
          });

          console.log('Database User lookup result:', user);

          if (user) {
            req.user = user;
            return next();
          }
        }
      }
    } catch (dbErr) {
      console.error("Database session lookup error:", dbErr);
    }

    console.error("Token verification failed entirely.");
    return res.status(403).json({ message: 'Forbidden: Invalid or expired session' });
  }
};

// ----------- Database -----------
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

    // ------------------ DOCTORS (public) ------------------
    app.get("/doctors", async (req, res) => {
      const doctors = await doctorsCollection.find({}).toArray();
      res.json(doctors);
    });

    app.get("/doctors/search", async (req, res) => {
      const query = req.query;
      const doctors = await doctorsCollection.find(query).toArray();
      res.json(doctors);
    });

    app.get('/doctors/:id', async (req, res) => {
      try {
        const doctor = await doctorsCollection.findOne({
          _id: new ObjectId(req.params.id)
        });
        if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
        res.json(doctor);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // ------------------ APPOINTMENTS (protected) ------------------
    app.get("/appointments", verifyToken, async (req, res) => {
      const userEmail = req.user.email;
      const appointments = await appointmentsCollection.find({ userEmail }).toArray();
      res.json(appointments);
    });

    app.post("/appointments", verifyToken, async (req, res) => {
      const appointment = {
        ...req.body,
        userEmail: req.user.email,
      };
      const result = await appointmentsCollection.insertOne(appointment);
      res.json(result);
    });

    app.put("/appointments/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const existing = await appointmentsCollection.findOne({ _id: new ObjectId(id) });
      if (!existing || existing.userEmail !== req.user.email) {
        return res.status(404).json({ message: 'Appointment not found or unauthorized' });
      }
      const result = await appointmentsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );
      res.json(result);
    });

    app.delete("/appointments/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const existing = await appointmentsCollection.findOne({ _id: new ObjectId(id) });
      if (!existing || existing.userEmail !== req.user.email) {
        return res.status(404).json({ message: 'Appointment not found or unauthorized' });
      }
      const result = await appointmentsCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // ------------------ USERS ------------------
    app.get("/users", async (req, res) => {
      const query = req.query;
      const users = await usersCollection.find(query).toArray();
      res.json(users);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
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

    // Ping
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