import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
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

// Profile collections
const seekersProfileCollection = database.collection("seekersProfile");
const recruitersProfileCollection = database.collection("recruitersProfile");
const adminsProfileCollection = database.collection("adminsProfile");

const jobsCollection = database.collection("jobs");
const applicationsCollection = database.collection("applications");
const savedJobsCollection = database.collection("savedJobs");

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

// -- PUBLIC API --

//PUBLIC API - All Companies get API

app.get("/companies", async (req, res) => {
  try {
    const searchQuery = req.query;

    const query = {
      status: "approved",
    };

    if (searchQuery?.search) {
      query.$or = [
        {
          name: {
            $regex: searchQuery.search,
            $options: "i",
          },
        },
        {
          industry: {
            $regex: searchQuery.search,
            $options: "i",
          },
        },
      ];
    }

    const page = Math.max(parseInt(searchQuery?.page) || 1, 1);
    const limit = 6;
    const skip = (page - 1) * limit;

    const [totalCompany, companyData] = await Promise.all([
      companiesCollection.countDocuments(query),

      companiesCollection
        .aggregate([
          {
            $match: query,
          },
          {
            $skip: skip,
          },

          {
            $limit: limit,
          },

          {
            $lookup: {
              from: "jobs",
              let: {
                companyId: {
                  $toString: "$_id",
                },
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        {
                          $eq: ["$companyId", "$$companyId"],
                        },
                        {
                          $eq: ["$status", "active"],
                        },
                      ],
                    },
                  },
                },
                {
                  $count: "count",
                },
              ],
              as: "activeJobs",
            },
          },

          {
            $addFields: {
              activeJobCount: {
                $ifNull: [
                  {
                    $arrayElemAt: ["$activeJobs.count", 0],
                  },
                  0,
                ],
              },
            },
          },

          {
            $project: {
              recruiterId: 0,
              recruiterEmail: 0,
              createdAt: 0,
              updatedAt: 0,
              activeJobs: 0,
            },
          },
        ])
        .toArray(),
    ]);

    res.json({
      totalCompany,
      companyData,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to load companies",
    });
  }
});

// All Jobs

app.post("/jobs/search", async (req, res) => {
  try {
    const {
      search = "",
      jobType = [],
      sortBy = "newest",
      postedWithIn = null,
      page = 1,
    } = req.body ?? {};

    // --------------------------------------------------
    // 1. Pagination
    // --------------------------------------------------

    const currentPage = Math.max(parseInt(page) || 1, 1);

    const jobsPerPage = 10;

    const skip = (currentPage - 1) * jobsPerPage;


    // --------------------------------------------------
    // 2. Check logged-in seeker
    // --------------------------------------------------

    const isSeeker = req.user?.role === "seeker";

    /*
      JWT payload-এর মধ্যে তোমার user id যদি `id` নামে থাকে
      তাহলে এটা কাজ করবে।

      আর যদি JWT payload-এ `sub` থাকে তাহলে fallback হিসেবে
      `sub` নেওয়া হচ্ছে।
    */

    const userId = req.user?.id || req.user?.sub;


    // --------------------------------------------------
    // 3. Base match
    // --------------------------------------------------

    const matchStage = {
      status: "active",
    };


    // --------------------------------------------------
    // 4. Search
    // --------------------------------------------------

    if (search.trim()) {
      matchStage.$or = [
        {
          jobTitle: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          jobCategory: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          companyName: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          city: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          country: {
            $regex: search.trim(),
            $options: "i",
          },
        },
      ];
    }


    // --------------------------------------------------
    // 5. Job type filter
    // --------------------------------------------------

    if (Array.isArray(jobType) && jobType.length > 0) {
      matchStage.jobType = {
        $in: jobType,
      };
    }


    // --------------------------------------------------
    // 6. Posted within filter
    // --------------------------------------------------

    if (postedWithIn) {
      const now = new Date();

      let fromDate = null;

      if (postedWithIn === "l24h") {
        fromDate = new Date(
          now.getTime() - 24 * 60 * 60 * 1000
        );
      }

      if (postedWithIn === "l7d") {
        fromDate = new Date(
          now.getTime() - 7 * 24 * 60 * 60 * 1000
        );
      }

      if (postedWithIn === "l30d") {
        fromDate = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        );
      }

      if (fromDate) {
        matchStage.createdAt = {
          $gte: fromDate,
        };
      }
    }


    // --------------------------------------------------
    // 7. Sort
    // --------------------------------------------------

    let sortStage = {
      createdAt: -1,
    };

    if (sortBy === "oldest") {
      sortStage = {
        createdAt: 1,
      };
    }

    if (sortBy === "salary-high") {
      sortStage = {
        salaryMax: -1,
      };
    }

    if (sortBy === "salary-low") {
      sortStage = {
        salaryMin: 1,
      };
    }


    // --------------------------------------------------
    // 8. Create aggregation pipeline
    // --------------------------------------------------

    const pipeline = [
      // -----------------------------------------------
      // Match
      // -----------------------------------------------

      {
        $match: matchStage,
      },


      // -----------------------------------------------
      // Sort
      // -----------------------------------------------

      {
        $sort: sortStage,
      },


      // -----------------------------------------------
      // Pagination + total count
      // -----------------------------------------------

      {
        $facet: {
          metadata: [
            {
              $count: "totalJobs",
            },
          ],

          jobs: [
            {
              $skip: skip,
            },

            {
              $limit: jobsPerPage,
            },
          ],
        },
      },


      // -----------------------------------------------
      // Convert facet result into clean structure
      // -----------------------------------------------

      {
        $project: {
          totalJobs: {
            $ifNull: [
              {
                $arrayElemAt: [
                  "$metadata.totalJobs",
                  0,
                ],
              },
              0,
            ],
          },

          jobs: 1,
        },
      },
    ];


    // --------------------------------------------------
    // 9. If logged-in seeker
    //    add saved-job lookup
    // --------------------------------------------------

    if (isSeeker && userId) {
      pipeline.push({
        $unwind: {
          path: "$jobs",
          preserveNullAndEmptyArrays: true,
        },
      });

      pipeline.push({
        $lookup: {
          from: "savedJobs",

          let: {
            jobId: {
              $toString: "$jobs._id",
            },
          },

          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        "$jobId",
                        "$$jobId",
                      ],
                    },

                    {
                      $eq: [
                        "$userId",
                        userId,
                      ],
                    },
                  ],
                },
              },
            },

            {
              $limit: 1,
            },
          ],

          as: "savedJob",
        },
      });


      pipeline.push({
        $set: {
          "jobs.isSaved": {
            $gt: [
              {
                $size: "$savedJob",
              },
              0,
            ],
          },
        },
      });


      pipeline.push({
        $project: {
          totalJobs: 1,

          jobs: 1,
        },
      });


      pipeline.push({
        $group: {
          _id: null,

          totalJobs: {
            $first: "$totalJobs",
          },

          jobs: {
            $push: "$jobs",
          },
        },
      });


      pipeline.push({
        $project: {
          _id: 0,

          totalJobs: 1,

          jobs: 1,
        },
      });
    }


    // --------------------------------------------------
    // 10. Execute aggregation
    // --------------------------------------------------

    const result = await jobsCollection
      .aggregate(pipeline)
      .toArray();


    const data = result[0] || {
      totalJobs: 0,
      jobs: [],
    };


    // --------------------------------------------------
    // 11. Response
    // --------------------------------------------------

    res.status(200).send({
      success: true,

      data: {
        jobs: data.jobs,

        pagination: {
          currentPage,

          jobsPerPage,

          totalJobs: data.totalJobs,

          totalPages: Math.ceil(
            data.totalJobs / jobsPerPage
          ),
        },

        permission: {
          canSaveJob: isSeeker,
        },
      },
    });
  } catch (error) {
    console.error("Job search error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to search jobs",
    });
  }
});

//  -- RECRUITERS API
// specific recruiter company data get API
app.get(`/recruiter/company/:recruiterId`, async (req, res) => {
  const { recruiterId } = req.params;

  // in this api enpoint I learnt lookup pipeline which is very helpfull for exclude or include needed field and its optimized

  // const inExistCompany = await companiesCollection.findOne({ recruiterId });

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

// specific recruiter  all jobs data get API

app.get("/recruiter/jobs/:recruiterId", async (req, res) => {
  try {
    const { recruiterId } = req.params;
    const page = Math.max(parseInt(req.query?.page) || 1, 1);
    const limit = 10;
    const skip = (page - 1) * limit;

    const result = await jobsCollection
      .aggregate([
        {
          $match: { recruiterId: recruiterId },
        },
        {
          /** Quick Revison
         * $facet is a powerful aggregation stage in MongoDB that allows you to perform multiple aggregations on the same set of input documents and return the results in a single document. It is particularly useful when you want to compute different aggregations or transformations on the same dataset without having to run multiple queries.
         
// $count: This stage counts the number of documents in the input and returns a single document with a field named "totalJobs"--> (name would be that which i will give) ...> that contains the count. In this case, it counts the total number of jobs for the specified recruiterId.

when need to learn about mongodb aggregation pipeline stages,expressions i have to go mongodb official doc -> Development -> Reference -> Query Language
        */

          $facet: {
            metaData: [{ $count: "totalJobs" }],
            activeJobs: [
              {
                $match: { status: "active" },
              },
              { $count: "activeJobs" },
            ],
            closedJobs: [
              { $match: { status: "closed" } },
              { $count: "closedJobs" },
            ],
            jobs: [
              { $sort: { createdAt: -1 } },
              { $skip: skip },
              { $limit: limit },
              {
                $lookup: {
                  from: "applications",
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ["$jobId", "$_id"] },
                        // instead using $expr and $eq, I can also use a simpler approach by directly matching the jobId field in the applications collection with the _id field of the jobs collection. This can be done using a regular $match stage without the need for $expr. Here's how I can modify the $lookup stage:
                        // jobId:'$_id'
                      },
                    },
                    {
                      $count: "total",
                    },
                  ],
                  as: "applicationStats",
                },
              },
              {
                $addFields: {
                  applicationCount: {
                    $ifNull: [
                      { $arrayElemAt: ["$applicationStats.total", 0] },
                      0,
                    ],
                  },
                },
              },
              {
                $project: {
                  jobTitle: 1,
                  jobCategory: 1,
                  jobType: 1,
                  location: 1,
                  companyId: 1,
                  recruiterId: 1,
                  status: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  applicationCount: 1,
                },
              },
            ],
          },
        },
        {
          $project: {
            totalJobs: {
              $ifNull: [{ $arrayElemAt: ["$metaData.totalJobs", 0] }, 0],
            },
            activeJobs: {
              $ifNull: [{ $arrayElemAt: ["$activeJobs.activeJobs", 0] }, 0],
            },
            closedJobs: {
              $ifNull: [{ $arrayElemAt: ["$closedJobs.closedJobs", 0] }, 0],
            },
            jobs: 1,
          },
        },
      ])
      .toArray();

    res.json(result[0]);
  } catch (err) {
    console.log("recruiter jobs data get API error", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal Server Error!" });
  }
});

app.get("/recruiter/job/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    const query = { _id: new ObjectId(jobId) };
    const result = await jobsCollection.findOne(query);

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal Server Error!" });
  }
});

// recruiter profile data get API

app.get("/recruiter/profile/:recruiterId", async (req, res) => {
  const { recruiterId } = req.params;

  const result = await recruitersProfileCollection.findOne({
    recruiterId: recruiterId,
  });

  res.json(result);
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

// recruiter new job post API

app.post("/recruiter/jobs", async (req, res) => {
  const recruiterJobData = req.body;

  const result = await jobsCollection.insertOne({
    ...recruiterJobData,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json(result);
});

// recruiter company profile update API

app.patch(`/recruiter/company/:companyId`, async (req, res) => {
  const { companyId } = req.params;

  const updatedData = req.body;
  const query = { _id: new ObjectId(companyId) };

  const updatedDoc = {
    $set: {
      ...updatedData,
      updatedAt: new Date(),
      status: "pending", // Set status to 'pending' when updating the company profile
    },
  };

  const result = await companiesCollection.updateOne(query, updatedDoc);

  res.json(result);
});

// recruiter job update API

app.patch("/recruiter/jobs/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    const updatedData = req.body;
    const query = { _id: new ObjectId(jobId) };

    const result = await jobsCollection.updateOne(query, {
      $set: {
        ...updatedData,
        updatedAt: new Date(),
      },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal Server Error!" });
  }
});

//recruiter profile update API

app.patch("/recruiter/profile/:recruiterId", async (req, res) => {
  const { recruiterId } = req.params;

  const { headline, bio, phone, coverImage, address, socialLinks } = req.body;

  console.log("request body", req.body);

  const result = await recruitersProfileCollection.updateOne(
    { recruiterId: recruiterId },
    {
      $set: {
        recruiterId,
        bio,
        phone,
        coverImage,
        address,
        socialLinks,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
    },
  );

  res.json(result);
});

//recruiter job delete API

app.delete("/recruiter/jobs/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    const result = await jobsCollection.deleteOne({ _id: new ObjectId(jobId) });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal Server Error!" });
  }
});

// --SEEKERS API --

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

// export default app;
