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
const purchasesCollection = database.collection("purchase");
const seekersProfileCollection = database.collection("seekersProfile");
const jobsCollection = database.collection("jobs");

// in future we can add other roles profile collections like recruitersProfileCollection, adminProfileCollection, etc.

// Middleware to ensure that the database is connected before handling any API requests
app.use(async (req, res, next) => {
  await connectToMongoDB();
  next();
});

// Call this only when your application terminates
// export async function disconnectFromMongoDB() {
//   // await client.close();
// }

// API Endpoints

// specific recruiter company data get API
app.get(`/recruiter/company/:recruiterId`, async (req, res) => {
  const { recruiterId } = req.params;

  // in this api enpoint I learnt lookup pipeline which is very helpfull for exclude or include needed field and its optimized

  const inExistCompany = await companiesCollection.findOne({ recruiterId });

  const result = await companiesCollection
    .aggregate([
      { $match: { recruiterId: recruiterId } },
      {
        $addFields: {
          recruiterObjectId: {
            $toObjectId: "$recruiterId",
          },
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "recruiterObjectId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 0,
                name: 1,
                image: 1,
                emailVerified: 1,
              },
            },
          ],
          as: "recruiter",
        },
      },
      {
        $unwind: "$recruiter",
      },
    ])
    .toArray();

  // console.log('recruiter company result',result)

  if (result.length === 0) {
    return res.json({
      isExistCompany: false,
      companyData: null,
    });
  }

  res.json({ isExistCompany: true, companyData: { ...result[0] } });
});

// recruiter company data post API

app.post("/recruiter/company", async (req, res) => {
  const companyData = req.body;

  const result = await companiesCollection.insertOne({
    ...companyData,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json(result);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

// export default app;
