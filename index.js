import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// mongodb connection

const client = new MongoClient(process.env.MONGODB_URI);

let isConnected = false;

export async function connectToMongoDB() {
  if (isConnected) {
    console.log("Already connected to MongoDB Atlas!");
    return client;
  }

  try {
    await client.connect();
    isConnected = true;
    console.log("Connected to MongoDB Atlas!");
    return client;

    // console.log("You successfully connected to MongoDB!");
  } catch (err) {
    console.dir(err);
  }
}

// Database Collections
const database = client.db("nexthire");
const usersCollection = database.collection("user");
const companiesCollection = database.collection("company");

// // 💡 Middleware দিয়ে নিশ্চিত করা হচ্ছে যেন প্রতিটি API হিটের আগে ডাটাবেজ কানেক্টেড থাকে
app.use(async (req, res, next) => {
  await connectToMongoDB();
  next();
});

// Call this only when your application terminates
// export async function disconnectFromMongoDB() {
//   // await client.close();
// }

// API Endpoints

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

// export default app;
