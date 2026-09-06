import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

//jose with remote jwks
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

// user authorize verify middleware
const authorizationMiddleware = async (req, res, next) => {
  const authorization = req?.headers?.authorization;
  // console.log("authorization is here", authorization);

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  const token = authorization.split(" ")[1];

  // console.log("token is here", token);
  if (!token || token === "undefined") {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);

    // console.log('this is payload',payload)

    req.user = payload;
    next();
    return;
  } catch (error) {
    console.error('authorization parse error',error)
    return res.status(401).json({ message: "Unauthorized access" });
  }
};

// public api authorization middleware

const publicAuthorizationMiddleware = async (req, res, next) => {
  const authorizaton = req?.headers?.authorization;

  if (!authorizaton || !authorizaton.startsWith("Bearer ")) {
    req.user = null;
    next();
  }

  const token = authorizaton.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    next();
  } catch (err) {
    req.user = null;
    next();
  }
};

// seeker role verify middleware

const seekerRoleVerifyMiddleware = async (req, res, next) => {
  if (req?.user?.role !== "seeker") {
    res.status(403).json({ success: false, message: "Forbidden access" });
  }

  next();
};
const recruiterRoleVerifyMiddleware = async (req, res, next) => {
  if (req?.user?.role !== "recruiter") {
    res.status(403).json({ success: false, message: "Forbidden access" });
  }

  next();
};
const adminRoleVerifyMiddleware = async (req, res, next) => {

  // console.log('example user payload',req?.user)

  if (req?.user?.role !== "admin") {
    res.status(403).json({ success: false, message: "Forbidden access" });
  }

  next();
};

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
const userAccountCollection = database.collection("account");
const companiesCollection = database.collection("company");
const purchasesCollection = database.collection("purchase");

// Profile collections
const seekersProfileCollection = database.collection("seekersProfile");
const recruitersProfileCollection = database.collection("recruitersProfile");
// In next release we will add admin  profile collection
// const adminsProfileCollection = database.collection("adminsProfile");

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

// Specific Company GET API

app.get("/companies/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    if (!ObjectId.isValid(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid company ID",
      });
    }

    // Company data get query

    const query = { _id: new ObjectId(companyId), status: "approved" };
    const result = await companiesCollection.findOne(query, {
      projection: {
        updatedAt: 0,
        recruiterEmail: 0,
        status: 0,
      },
    });

    res.json({
      success: true,
      companyData: result,
    });
  } catch (err) {
    console.log("ERROR", err);
    return res.status(500).json({
      success: false,
      message: "Failed to get company profile",
    });
  }
});

// All Jobs

// these api should use user set middleware via parsing jwt
//MIDDLWARE NEED
app.post("/jobs/search",publicAuthorizationMiddleware, async (req, res) => {
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

    // temporary getting demo isSeeker
    const isSeeker = req.user?.role === "seeker";
    // const isSeeker = true;
    /*
      JWT payload-এর মধ্যে তোমার user id যদি `id` নামে থাকে
      তাহলে এটা কাজ করবে।

      আর যদি JWT payload-এ `sub` থাকে তাহলে fallback হিসেবে
      `sub` নেওয়া হচ্ছে।
    */

   const userId = req.user?.id || req.user?.sub;
   //temporary taking userid from userId
    // const userId = "6a5d12ce383dfe167a9f8c81";

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
        fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      if (postedWithIn === "l7d") {
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      if (postedWithIn === "l30d") {
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
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
                $arrayElemAt: ["$metadata.totalJobs", 0],
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
                      $eq: ["$jobId", "$$jobId"],
                    },

                    {
                      $eq: ["$userId", userId],
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

    const result = await jobsCollection.aggregate(pipeline).toArray();

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

          totalPages: Math.ceil(data.totalJobs / jobsPerPage),
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
//MIDDLEWARE NEED
app.get("/jobs/:jobId",publicAuthorizationMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!ObjectId.isValid(jobId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID",
      });
    }

    const jobObjectId = new ObjectId(jobId);

    const isSeeker = req.user?.role === "seeker";
    // for testing purpose
    // const isSeeker = true;

    const userId =
      isSeeker && req.user?.id ? req.user?.id : null;
      //for testing purpose
   

    const pipeline = [
      // Stage 1
      {
        $match: {
          _id: jobObjectId,
        },
      },
      {
        $addFields: {
          companyObjectId: {
            $toObjectId: "$companyId",
          },
        },
      },
      // Stage 2
      {
        $lookup: {
          from: "company",
          localField: "companyObjectId",
          foreignField: "_id",
          as: "company",
        },
      },

      // Stage 3
      {
        $unwind: {
          path: "$company",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    // Only seeker needs application lookup
    if (isSeeker) {
      pipeline.push(
        {
          $lookup: {
            from: "applications",
            let: {
              jobId: {
                $toString: "$_id",
              },
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $eq: ["$jobId", "$$jobId"],
                      },
                      {
                        $eq: ["$userId", userId],
                      },
                    ],
                  },
                },
              },
              {
                $limit: 1,
              },
            ],
            as: "application",
          },
        },
        {
          $set: {
            isApplied: {
              $gt: [
                {
                  $size: "$application",
                },
                0,
              ],
            },
          },
        },
      );
    } else {
      pipeline.push({
        $set: {
          isApplied: false,
        },
      });
    }

    pipeline.push({
      $set: {
        permission: {
          canApply: isSeeker,
        },
      },
    });

    // Final projection
    pipeline.push({
      $project: {
        _id: 1,
        jobTitle: 1,

        jobType: 1,
        experienceLevel: 1,
        location: 1,
        salaryMax: 1,
        salaryMin: 1,
        currency: 1,
        isRemote: 1,
        requirements: 1,
        responsibilities: 1,
        recruiterId: 1,
        skills: 1,
        deadline: 1,
        createdAt: 1,
        applicationDeadline: 1,

        company: {
          name: 1,
          industry: 1,
          logo: 1,
          // _id:1,
          companyId: "$company._id",
          // website:1,
          location: 1,
          employeeRange: 1,
        },
        isApplied: 1,
        permission: 1,
      },
    });

    const result = await jobsCollection.aggregate(pipeline).toArray();

    if (!result.length) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch job details",
    });
  }
});

//  -- RECRUITERS API

// specific recruiter company data get API
app.get(`/recruiter/company/:recruiterId`,authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
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

// recruiter new job post API

app.post("/recruiter/jobs",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  const recruiterJobData = req.body;

  const result = await jobsCollection.insertOne({
    ...recruiterJobData,
    applicationDeadline: new Date(recruiterJobData.applicationDeadline),
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json(result);
});
// recruiter job update API

app.patch("/recruiter/jobs/:jobId",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;

    const updatedData = req.body;
    const query = { _id: new ObjectId(jobId) };

    const result = await jobsCollection.updateOne(query, {
      $set: {
        ...updatedData,
        // added date ISO string
        applicationDeadline: new Date(updatedData.applicationDeadline),
        updatedAt: new Date(),
      },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal Server Error!" });
  }
});

//recruiter job delete API

app.delete("/recruiter/jobs/:jobId",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;

    const result = await jobsCollection.deleteOne({ _id: new ObjectId(jobId) });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal Server Error!" });
  }
});

// specific recruiter  all jobs data get API

app.get("/recruiter/jobs/:recruiterId",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
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

// recruiter job data get API

app.get("/recruiter/job/:jobId",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;

    const query = { _id: new ObjectId(jobId) };
    const result = await jobsCollection.findOne(query);

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal Server Error!" });
  }
});

// recruiter single job applicants get API
app.get("/recruiter/job-applicants/:jobId",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;

    const { status, page = 1 } = req.query;

    const pageNumber = Math.max(parseInt(page), 1);
    const LIMIT = 10;

    const skip = (pageNumber - 1) * LIMIT;

    const matchCondition = {
      jobId: jobId, // joId is string inside applications collection
    };

    /**
     * [
  "applied",
  "screening",
  "shortlisted",
  "interview",
  "hired",
  "rejected",
  "withdrawn"
]
     */
    const matchableStatus = status?.toLowerCase();
    if (
      matchableStatus === "applied" ||
      matchableStatus === "screening" ||
      matchableStatus === "shortlisted" ||
      matchableStatus === "interview" ||
      matchableStatus === "hired" ||
      matchableStatus === "rejected" ||
      matchCondition === "withdrawn"
    ) {
      matchCondition.status = status;
    }

    const result = await applicationsCollection
      .aggregate([
        // Stage 1
        {
          $match: matchCondition,
          // status:{$ne:'withdrawn'}
        },

        // Stage 2
        {
          $facet: {
            metadata: [
              {
                $count: "totalApplications",
              },
            ],

            applications: [
              {
                $sort: {
                  createdAt: -1,
                },
              },

              {
                $skip: skip,
              },

              {
                $limit: LIMIT,
              },

              {
                $project: {
                  companyId: 0,
                  coverLetter: 0,
                },
              },
            ],
          },
        },

        // Stage 3
        {
          $project: {
            applications: 1,

            totalApplications: {
              $ifNull: [
                {
                  $arrayElemAt: ["$metadata.totalApplications", 0],
                },
                0,
              ],
            },
          },
        },
      ])
      .toArray();

    const data = result[0];

    const totalApplications = data?.totalApplications || 0;

    const totalPages = Math.ceil(totalApplications / LIMIT);

    res.status(200).json({
      success: true,

      data: {
        applications: data?.applications || [],

        pagination: {
          currentPage: pageNumber,
          limit: LIMIT,
          totalApplications,
          totalPages,
        },
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// recruiter applications status update api

app.patch("/recruiter/job-applicants/:applicationId",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  // have to verify

  try {
    const { applicationId } = req.params;

    const query = { _id: new ObjectId(applicationId) };
    const { status = "applied" } = req.body;

    // TODO: if any seeker got hired a mail will send to the seeker inbox

    if (status === "withdrawn") {
      res.status(400).json({
        success: false,
        message: "status change withdrawn not allowed",
      });
    }
    // if(status==='hired'){
    //   console.log('yaaiii the seeker got hired')
    // }

    const result = await applicationsCollection.updateOne(query, {
      $set: { status: status.toLowerCase(), updatedAt: new Date() },
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// recruiter company data post API

app.post("/recruiter/company",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  const companyData = req.body;

  // check any company exist with the same recruiterId, prevent multiple company creation

  // company status can be
  // pending , approved,rejected

  const {
    name,
    industry,
    description,
    website,
    location,
    employeeRange,
    logo,
    recruiterId,
    recruiterEmail,
  } = req.body;

  const result = await companiesCollection.insertOne({
    name,
    industry,
    location,
    website,
    employeeRange,
    logo,
    description,
    recruiterId,
    recruiterEmail,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json(result);
});

// recruiter company profile update API

app.patch(`/recruiter/company/:companyId`,authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
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

// recruiter profile data get API

app.get("/recruiter/profile/:recruiterId",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  const { recruiterId } = req.params;

  const result = await recruitersProfileCollection.findOne({
    recruiterId: recruiterId,
  });

  res.json(result);
});

//recruiter profile update API

app.patch("/recruiter/profile/:recruiterId",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  const { recruiterId } = req.params;

  const { headline, bio, phone, coverImage, address, socialLinks } = req.body;

  // console.log("request body", req.body);

  const result = await recruitersProfileCollection.updateOne(
    { recruiterId: recruiterId },
    {
      $set: {
        recruiterId,
        headline,
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

// recruiter dashboard stats get API

// API convention - /dashboard/role/:id

app.get("/dashboard/recruiter/:recruiterId",authorizationMiddleware,recruiterRoleVerifyMiddleware, async (req, res) => {
  try {
    const { recruiterId } = req.params;

    // console.log("hitting the api");
    const [jobStats, applicationStats, recentApplications, company] =
      await Promise.all([
        // =========================
        // Job statistics
        // =========================
        jobsCollection
          .aggregate([
            {
              $match: {
                recruiterId,
              },
            },
            {
              $group: {
                _id: null,

                totalJobPosts: {
                  $sum: 1,
                },

                activeJobs: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                  },
                },
              },
            },
          ])
          .toArray(),

        // =========================
        // Application statistics
        // =========================
        applicationsCollection
          .aggregate([
            {
              $match: {
                recruiterId,
              },
            },
            {
              $group: {
                _id: null,

                totalApplications: {
                  $sum: 1,
                },

                totalHired: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "hired"] }, 1, 0],
                  },
                },
              },
            },
          ])
          .toArray(),

        // =========================
        // Recent 10 applications
        // =========================
        applicationsCollection
          .aggregate([
            {
              $match: {
                recruiterId,
              },
            },

            {
              $sort: {
                createdAt: -1,
              },
            },

            {
              $limit: 10,
            },

            {
              $project: {
                _id: 1,
                name: 1,
                jobId: 1,
                jobName: 1,
                status: 1,
                createdAt: 1,
              },
            },
          ])
          .toArray(),

        // =========================
        // Company
        // =========================
        companiesCollection.findOne(
          { recruiterId },
          {
            projection: {
              _id: 1,
              name: 1,
              logo: 1,
              location: 1,
              website: 1,
              industry: 1,
            },
          },
        ),
      ]);

    const jobData = jobStats[0] || {
      totalJobPosts: 0,
      activeJobs: 0,
    };

    const applicationData = applicationStats[0] || {
      totalApplications: 0,
      totalHired: 0,
    };

    res.status(200).json({
      success: true,

      data: {
        stats: {
          totalJobPosts: jobData.totalJobPosts,
          activeJobs: jobData.activeJobs,
          totalApplications: applicationData.totalApplications,
          totalHired: applicationData.totalHired,
        },

        recentApplications,

        company,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// --SEEKERS API --

// seeker save job

app.post("/seeker/saved-jobs",authorizationMiddleware,seekerRoleVerifyMiddleware, async (req, res) => {
  // need verify middleware or logic

  try {
    const {
      userId,
      jobId,
      jobTitle,
      companyId,
      companyName,
      applicationDeadline,
    } = req.body;

    const saveJodBody = {
      userId,
      jobId,
      jobName: jobTitle,
      companyName,
      companyId,
      applicationDeadline: new Date(applicationDeadline),
      createdAt: new Date(),
    };

    const result = await savedJobsCollection.insertOne(saveJodBody);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal Server Error!" });
  }
});

// seeker delete saved job
app.delete("/seeker/saved-jobs/:userId/:jobId",authorizationMiddleware,seekerRoleVerifyMiddleware, async (req, res) => {
  //TODO: need verify middleware or logic
  try {
    const { userId, jobId } = req.params;

    const result = await savedJobsCollection.deleteOne({ userId, jobId });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal Server Error!" });
  }
});

// seeker saved jobs get API

app.get(
  "/seeker/saved-jobs/:seekerId",
  authorizationMiddleware,
  seekerRoleVerifyMiddleware,
  async (req, res) => {
    try {
      const { seekerId } = req.params;

      if (!ObjectId.isValid(seekerId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid job ID",
        });
      }

      const search = req.query.search?.trim() || "";
      const page = Math.max(1, parseInt(req.query.page) || 1);

      const limit = 10; // server-side fixed
      const skip = (page - 1) * limit;

      const pipeline = [
        // 1. Only this seeker's saved jobs
        {
          $match: {
            userId: seekerId,
          },
        },

        // 2. Search by job name
        ...(search
          ? [
              {
                $match: {
                  jobName: {
                    $regex: search,
                    $options: "i",
                  },
                },
              },
            ]
          : []),

        // 3. Add canApplyJob
        {
          $addFields: {
            canApplyJob: {
              $and: [
                {
                  $ne: [{ $type: "$applicationDeadline" }, "missing"],
                },
                {
                  $gt: ["$applicationDeadline", new Date()],
                },
              ],
            },
          },
        },

        // 4. Latest saved jobs first
        {
          $sort: {
            createdAt: -1,
          },
        },

        // 5. Pagination + total count
        {
          $facet: {
            metadata: [
              {
                $count: "total",
              },
            ],
            data: [
              {
                $skip: skip,
              },
              {
                $limit: limit,
              },
            ],
          },
        },

        // 6. Make response easier to use
        {
          $project: {
            data: 1,
            total: {
              $ifNull: [{ $arrayElemAt: ["$metadata.total", 0] }, 0],
            },
          },
        },
      ];

      const result = await savedJobsCollection.aggregate(pipeline).toArray();

      const data = result[0]?.data || [];
      const total = result[0]?.total || 0;

      res.status(200).json({
        success: true,
        data,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
);

// seeker job apply
app.post("/seeker/apply-job/:jobId",authorizationMiddleware,seekerRoleVerifyMiddleware, async (req, res) => {
  // seeker apply job once
  // only seeker can apply job

  try {
    // const {jobId}=req.params

    // In future we will protect the multiple apply post request for a seeker
    const {
      userId,
      jobId,
      name,
      email,
      phone,
      resumeDriveLink,
      message,
      recruiterId,
      companyId,
      jobName,
      applicationDeadline,
    } = req.body;

    const result = await applicationsCollection.insertOne({
      userId,
      jobId,
      name,
      email,
      recruiterId,
      phone,
      resumeDriveLink,
      message,
      companyId,
      jobName,
      status: "applied",
      applicationDeadline: new Date(applicationDeadline),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Internal Server Error!" });
  }
});

// seeker applications data get API

app.get("/seeker/applications/:seekerId",authorizationMiddleware,seekerRoleVerifyMiddleware, async (req, res) => {
  try {
    const { seekerId } = req.params;

    const { search = "", status = "", page = "1" } = req.query;

    // Server-side pagination
    const limit = 10;

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);

    const skip = (pageNumber - 1) * limit;

    // Allowed application statuses
    const allowedStatuses = [
      "applied",
      "screening",
      "shortlisted",
      "interview",
      "hired",
      "rejected",
      "withdrawn",
    ];

    // Base match
    const baseMatch = {
      userId: seekerId,
    };

    // Search
    if (search.trim()) {
      baseMatch.jobName = {
        $regex: search.trim(),
        $options: "i",
      };
    }

    // Status filter
    if (allowedStatuses.includes(status)) {
      baseMatch.status = status;
    }

    const pipeline = [
      // Stage 1
      {
        $match: {
          userId: seekerId,
        },
      },

      // Stage 2
      {
        $facet: {
          // -----------------------------
          // Statistics
          // -----------------------------
          stats: [
            {
              $group: {
                _id: null,

                totalApplied: {
                  $sum: 1,
                },

                totalShortlisted: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "shortlisted"] }, 1, 0],
                  },
                },

                totalInterview: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "interview"] }, 1, 0],
                  },
                },
              },
            },

            // Calculate success rate
            {
              $project: {
                _id: 0,
                totalApplied: 1,
                totalShortlisted: 1,
                totalInterview: 1,

                successRate: {
                  $cond: [
                    { $eq: ["$totalApplied", 0] },
                    0,
                    {
                      $multiply: [
                        {
                          $divide: ["$totalInterview", "$totalApplied"],
                        },
                        100,
                      ],
                    },
                  ],
                },
              },
            },
          ],

          // -----------------------------
          // Applications
          // -----------------------------
          applications: [
            {
              $match: baseMatch,
            },

            {
              $sort: {
                createdAt: -1,
              },
            },

            {
              $skip: skip,
            },

            {
              $limit: limit,
            },
          ],

          // -----------------------------
          // Pagination metadata
          // -----------------------------
          metadata: [
            {
              $match: baseMatch,
            },

            {
              $count: "totalApplications",
            },
          ],
        },
      },
    ];

    const result = await applicationsCollection.aggregate(pipeline).toArray();

    const data = result[0];

    const stats = data.stats[0] || {
      totalApplied: 0,
      totalShortlisted: 0,
      totalInterview: 0,
      successRate: 0,
    };

    const totalApplications = data.metadata[0]?.totalApplications || 0;

    const totalPages = Math.ceil(totalApplications / limit);

    res.status(200).json({
      success: true,

      data: {
        stats,

        applications: data.applications,

        pagination: {
          currentPage: pageNumber,
          limit,
          totalApplications,
          totalPages,
        },
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// seeker applications status update (PATCH) API

app.patch("/seeker/applications/:applicationId",authorizationMiddleware,seekerRoleVerifyMiddleware, async (req, res) => {
  try {
    const { applicationId } = req.params;

    const { status } = req.body;

    if (
      status.toLowerCase() !== "withdrawn" &&
      status.toLowerCase() !== "applied"
    ) {
      res.status(400).json({
        success: false,
        message: "not allowed to change other status",
      });
    }

    const query = { _id: new ObjectId(applicationId) };
    const result = await applicationsCollection.updateOne(query, {
      $set: {
        status,
        updatedAt: new Date(),
      },
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// seeker profile data get API
app.get("/seeker/profile/:seekerId",authorizationMiddleware,seekerRoleVerifyMiddleware, async (req, res) => {
  const { seekerId } = req.params;
  if (!ObjectId.isValid(seekerId)) {
    res.status(400).json({ success: false, message: "Invalid seeker ID" });
  }

  try {
    const result = await seekersProfileCollection.findOne({ seekerId });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Interval server error" });
  }
});
// seeker profile data update API

app.patch("/seeker/profile/:seekerId",authorizationMiddleware,seekerRoleVerifyMiddleware, async (req, res) => {
  try {
    const { seekerId } = req.params;

    // needed field can be

    /**
     * seekerId
     * phone
     * coverImage
     * address
     * headline
     * bio
     * skills :string[]
     * resumeDriveLink
     * socialLinks:string[]
     */

    const {
      phone,
      coverImage,
      address,
      headline,
      bio,
      skills,
      resumeDriveLink,
      socialLinks,
      portfolioLink,
    } = req.body;

    const result = await seekersProfileCollection.updateOne(
      { seekerId },
      {
        $set: {
          seekerId,
          phone,
          coverImage,
          headline,
          bio,
          skills,
          address,
          socialLinks,
          resumeDriveLink,
          portfolioLink,
          updatedAt: new Date(),
        },

        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// seeker dashboard stats get API
app.get("/dashboard/seeker/:seekerId",authorizationMiddleware,seekerRoleVerifyMiddleware, async (req, res) => {
  try {
    const { seekerId } = req.params;

    // 1. Authentication / authorization check
    // Make sure logged-in seeker can access only his own dashboard.

    const [savedJobsResult, applicationsResult, latestJobs, profile] =
      await Promise.all([
        // Saved jobs count
        savedJobsCollection.countDocuments({
          userId: seekerId,
        }),

        // Applications:
        // - total applications
        // - interview count
        // - rejected count
        // - latest 5 except applied & withdrawn
        applicationsCollection
          .aggregate([
            {
              $match: {
                userId: seekerId,
              },
            },
            {
              $facet: {
                stats: [
                  {
                    $group: {
                      _id: null,

                      totalApplications: {
                        $sum: 1,
                      },

                      totalInterview: {
                        $sum: {
                          $cond: [{ $eq: ["$status", "interview"] }, 1, 0],
                        },
                      },

                      totalRejected: {
                        $sum: {
                          $cond: [{ $eq: ["$status", "rejected"] }, 1, 0],
                        },
                      },
                    },
                  },
                ],

                latestApplications: [
                  {
                    $match: {
                      status: {
                        $nin: ["applied", "withdrawn"],
                      },
                    },
                  },
                  {
                    $sort: {
                      updatedAt: -1,
                      createdAt: -1,
                    },
                  },
                  {
                    $limit: 5,
                  },
                  {
                    $project: {
                      name: 0,
                      email: 0,
                      recruiterId: 0,
                      message: 0,
                      companyId: 0,
                    },
                  },
                ],
              },
            },
          ])
          .toArray(),

        // Latest 5 active jobs
        jobsCollection
          .find({
            status: "active",
          })
          .sort({
            createdAt: -1,
          })
          .limit(5)
          .project({
            salaryMin: 0,
            salaryMax: 0,
            responsibilities: 0,
            requirements: 0,
            benefits: 0,
            companyId: 0,
            companyName: 0,
            recruiterId: 0,
            recruiterEmail: 0,
            companyImage: 0,
            updatedAt: 0,
            city: 0,
            country: 0,
          })
          .toArray(),

        // Seeker profile
        seekersProfileCollection.findOne({
          seekerId,
        }),
      ]);

    // Extract application aggregation result
    const applicationData = applicationsResult[0] || {};

    const stats = applicationData.stats?.[0] || {
      totalApplications: 0,
      totalInterview: 0,
      totalRejected: 0,
    };

    const latestApplications = applicationData.latestApplications || [];

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalSavedJobs: savedJobsResult,
          totalApplications: stats.totalApplications,
          totalInterview: stats.totalInterview,
          totalRejected: stats.totalRejected,
        },

        latestJobs,

        profile,

        latestApplications,
      },
    });
  } catch (err) {
    console.error("seeker dashboard stats get API error", err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ADMIN API

// Admin all companies data GET API

app.get("/admin/companies", authorizationMiddleware,adminRoleVerifyMiddleware, async (req, res) => {
  try {
    const { search = "", status = "", page = "1" } = req.query;

    // server-side fixed limit
    const limit = 10;

    // safe page parsing
    const parsedPage = Number.parseInt(page, 10);
    const currentPage =
      Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const skip = (currentPage - 1) * limit;

    // allowed company statuses
    const allowedStatuses = ["pending", "approved", "rejected"];

    // query for companies list
    const matchQuery = {};

    // search by company name or industry
    if (search.trim()) {
      const searchText = search.trim();

      matchQuery.$or = [
        {
          name: {
            $regex: searchText,
            $options: "i",
          },
        },
        {
          industry: {
            $regex: searchText,
            $options: "i",
          },
        },
      ];
    }

    // only add status filter if valid status comes from client
    const filterReadyStatus = status?.trim()?.toLowerCase() || "";
    if (allowedStatuses.includes(filterReadyStatus)) {
      matchQuery.status = filterReadyStatus;
    }

    const result = await companiesCollection
      .aggregate([
        {
          $facet: {
            // filtered + searched companies
            companies: [
              {
                $match: matchQuery,
              },
              {
                $sort: {
                  createdAt: -1,
                },
              },
              {
                $skip: skip,
              },
              {
                $limit: limit,
              },
            ],

            // total count after search/filter
            filteredCount: [
              {
                $match: matchQuery,
              },
              {
                $count: "count",
              },
            ],

            // overall stats
            stats: [
              {
                $group: {
                  _id: null,

                  totalCompanies: {
                    $sum: 1,
                  },

                  pendingCompanies: {
                    $sum: {
                      $cond: [
                        {
                          $eq: ["$status", "pending"],
                        },
                        1,
                        0,
                      ],
                    },
                  },

                  approvedCompanies: {
                    $sum: {
                      $cond: [
                        {
                          $eq: ["$status", "approved"],
                        },
                        1,
                        0,
                      ],
                    },
                  },

                  rejectedCompanies: {
                    $sum: {
                      $cond: [
                        {
                          $eq: ["$status", "rejected"],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  totalCompanies: 1,
                  pendingCompanies: 1,
                  approvedCompanies: 1,
                  rejectedCompanies: 1,
                },
              },
            ],
          },
        },
      ])
      .toArray();

    const data = result[0];

    const totalFilteredCompanies = data.filteredCount[0]?.count || 0;

    const stats = data.stats[0] || {
      totalCompanies: 0,
      pendingCompanies: 0,
      approvedCompanies: 0,
      rejectedCompanies: 0,
    };

    res.status(200).json({
      success: true,

      data: data.companies,

      stats,

      pagination: {
        currentPage,
        totalPages: Math.ceil(totalFilteredCompanies / limit),
        totalCompanies: totalFilteredCompanies,
        limit,
      },
    });
  } catch (err) {
    console.error("Get admin companies error:", err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// admin company status update API

app.patch("/admin/company/:companyId", authorizationMiddleware,adminRoleVerifyMiddleware, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { status } = req.body;
    const query = { _id: new ObjectId(companyId) };
    const refactorStatus = status?.trim()?.toLowerCase();

    if (refactorStatus !== "approved" && refactorStatus !== "rejected") {
      res
        .status(400)
        .json({ success: false, message: "Admin can approve or reject only" });
    }

    const result = await companiesCollection.updateOne(query, {
      $set: {
        status: refactorStatus,
        updatedAt: new Date(),
      },
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("Admin company status update error", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// admin all jobs data GET API

app.get("/admin/jobs", authorizationMiddleware,adminRoleVerifyMiddleware, async (req, res) => {
  try {
    const { search = "", status = "", page = "1" } = req.query;

    // -------------------------
    // Pagination
    // -------------------------

    const currentPage = Math.max(1, parseInt(page, 10) || 1);

    // Client will not control limit
    const limit = 10;

    const skip = (currentPage - 1) * limit;

    // -------------------------
    // Search + Filter Query
    // -------------------------

    const jobQuery = {};

    // Search by jobTitle OR jobCategory
    if (search.trim()) {
      jobQuery.$or = [
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
      ];
    }

    // Status filter
    if (
      status.toLowerCase() === "active" ||
      status.toLocaleLowerCase() === "closed"
    ) {
      jobQuery.status = status;
    }

    // -------------------------
    // Last Month Date Range
    // -------------------------

    const now = new Date();

    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // -------------------------
    // Aggregation
    // -------------------------

    const result = await jobsCollection
      .aggregate([
        {
          $facet: {
            // =========================
            // Stats
            // =========================

            stats: [
              {
                $group: {
                  _id: null,

                  // Total jobs
                  totalJobPost: {
                    $sum: 1,
                  },

                  // Total active jobs
                  totalActiveJobs: {
                    $sum: {
                      $cond: [
                        {
                          $eq: ["$status", "active"],
                        },
                        1,
                        0,
                      ],
                    },
                  },

                  // Total closed jobs
                  totalClosedJobs: {
                    $sum: {
                      $cond: [
                        {
                          $eq: ["$status", "closed"],
                        },
                        1,
                        0,
                      ],
                    },
                  },

                  // Jobs posted during previous calendar month
                  lastMonthPostedJobs: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            {
                              $gte: ["$createdAt", startOfLastMonth],
                            },
                            {
                              $lt: ["$createdAt", startOfThisMonth],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },

              {
                $project: {
                  _id: 0,
                  totalJobPost: 1,
                  totalActiveJobs: 1,
                  totalClosedJobs: 1,
                  lastMonthPostedJobs: 1,
                },
              },
            ],

            // =========================
            // Jobs
            // =========================

            jobs: [
              {
                $match: jobQuery,
              },

              {
                $sort: {
                  createdAt: -1,
                },
              },

              {
                $skip: skip,
              },

              {
                $limit: limit,
              },

              // Send only required fields
              {
                $project: {
                  _id: 1,
                  jobTitle: 1,
                  jobCategory: 1,
                  jobType: 1,
                  companyId: 1,
                  companyName: 1,
                  companyImage: 1,
                  city: 1,
                  country: 1,
                  location: 1,
                  status: 1,
                  applicationDeadline: 1,
                  createdAt: 1,
                },
              },
            ],

            // =========================
            // Pagination Metadata
            // =========================

            totalFilteredJobs: [
              {
                $match: jobQuery,
              },

              {
                $count: "total",
              },
            ],
          },
        },
      ])
      .toArray();

    // -------------------------
    // Stats
    // -------------------------

    const stats = result[0].stats[0] || {
      totalJobPost: 0,
      totalActiveJobs: 0,
      totalClosedJobs: 0,
      lastMonthPostedJobs: 0,
    };

    // -------------------------
    // Pagination
    // -------------------------

    const totalFilteredJobs = result[0].totalFilteredJobs[0]?.total || 0;

    const totalPages = Math.ceil(totalFilteredJobs / limit);

    // -------------------------
    // Response
    // -------------------------

    res.status(200).json({
      success: true,

      stats,

      jobs: result[0].jobs,

      pagination: {
        currentPage,
        limit,
        totalJobs: totalFilteredJobs,
        totalPages,
      },
    });
  } catch (err) {
    console.error("Failed to get admin all jobs", err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// admin job data Delete API

app.delete("/admin/job/:jobId", authorizationMiddleware,adminRoleVerifyMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!ObjectId.isValid(jobId)) {
      res.status(400).json({ success: false, message: "Job Id is not valid" });
    }

    const result = await jobsCollection.deleteOne({ _id: new ObjectId(jobId) });

    res.status(200).json({
      success: false,
      data: result,
      message: "Job data deleted successfully",
    });
  } catch (err) {
    console.error("Admin job data delete error", err);
    res.status(500).json({ success: false, message: "Interval server error" });
  }
});

// admin users data GET API

app.get("/admin/users", authorizationMiddleware,adminRoleVerifyMiddleware, async (req, res) => {
  try {
    const { search = "", role = "", page = 1 } = req.query;

    const limit = 20;

    const currentPage = Math.max(parseInt(page) || 1, 1);
    const skip = (currentPage - 1) * limit;

    // --------------------------------
    // Search + Role Filter
    // --------------------------------

    const query = {};

    // Search by name or email
    if (search.trim()) {
      query.$or = [
        {
          name: {
            $regex: search.trim(),
            $options: "i",
          },
        },
        {
          email: {
            $regex: search.trim(),
            $options: "i",
          },
        },
      ];
    }

    // Role filter
    const allowedRoles = ["seeker", "recruiter", "admin"];

    if (allowedRoles.includes(role)) {
      query.role = role;
    }

    // Last 24 hours
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // --------------------------------
    // Aggregation
    // --------------------------------

    const result = await usersCollection
      .aggregate([
        {
          $facet: {
            // ==============================
            // Users
            // ==============================

            users: [
              {
                $match: query,
              },
              {
                $sort: {
                  createdAt: -1,
                },
              },
              {
                $skip: skip,
              },
              {
                $limit: limit,
              },
              // {
              //   $project: {
              //     password: 0,
              //   },
              // },
            ],

            // ==============================
            // Pagination Count
            // ==============================

            totalFilteredUsers: [
              {
                $match: query,
              },
              {
                $count: "count",
              },
            ],

            // ==============================
            // Stats
            // ==============================

            stats: [
              {
                $group: {
                  _id: null,

                  // Total users
                  totalUsers: {
                    $sum: 1,
                  },

                  // Total recruiters
                  totalRecruiters: {
                    $sum: {
                      $cond: [
                        {
                          $eq: ["$role", "recruiter"],
                        },
                        1,
                        0,
                      ],
                    },
                  },

                  // Total seekers
                  totalSeekers: {
                    $sum: {
                      $cond: [
                        {
                          $eq: ["$role", "seeker"],
                        },
                        1,
                        0,
                      ],
                    },
                  },

                  // Last 24 hours signup
                  last24HoursSignups: {
                    $sum: {
                      $cond: [
                        {
                          $gte: ["$createdAt", last24Hours],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                },
              },
            ],
          },
        },
      ])
      .toArray();

    // --------------------------------
    // Extract facet results
    // --------------------------------

    const data = result[0];

    const totalFilteredUsers = data.totalFilteredUsers[0]?.count || 0;

    const stats = data.stats[0] || {
      totalUsers: 0,
      totalRecruiters: 0,
      totalSeekers: 0,
      last24HoursSignups: 0,
    };

    const totalPages = Math.ceil(totalFilteredUsers / limit);

    // --------------------------------
    // Response
    // --------------------------------

    res.status(200).json({
      success: true,

      stats,

      users: data.users,

      pagination: {
        currentPage,
        limit,
        totalUsers: totalFilteredUsers,
        totalPages,
        // hasNextPage: currentPage < totalPages,
        // hasPreviousPage: currentPage > 1,
      },
    });
  } catch (err) {
    console.error("Admin all users data get error", err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// admin user role update (patch) API

app.patch("/admin/user/:userId", authorizationMiddleware,adminRoleVerifyMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const { role = "" } = req.body;

    const exactRole = role?.trim()?.toLowerCase();

    const allowedRoles = ["seeker", "recruiter", "admin"];
    let userChanges = {};

    // in future have to check if admin try change their role we will block

    //
    // if(req?.user?.id === userId){
    // res.status(403).json({success:false,message:'Admin can not change own role'})
    // }

    if (!allowedRoles.includes(exactRole)) {
      res.status(400).json({ success: false, message: "Invalid status" });
    }

    if (exactRole === "seeker") {
      userChanges.role = "seeker";
      userChanges.plan = "seeker_free";
    } else if (exactRole === "recruiter") {
      userChanges.role = "recruiter";
      userChanges.plan = "recruiter_free";
    } else {
      userChanges.role = "admin";
      userChanges.plan = "none";
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: userChanges,
      },
    );

    res.status(200).json({
      success: true,
      data: result,
      message: "Role updated successfully",
    });
  } catch (err) {
    console.error("Admin user role api error", err);
    res.status(500).json({ success: false, message: "Interval server error" });
  }
});

//admin user delete API

app.delete("/admin/user/:userId", authorizationMiddleware,adminRoleVerifyMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // if (req?.user?.id === userId) {
    // res
    // .status(403)
    // .json({ success: false, message: "Admin can not delete own account " });
    // }

    // admin middleware need

    const [userDeleteResult, userAccountDeleteResult] = await Promise.all([
      usersCollection.deleteOne({ _id: new ObjectId(userId) }),
      userAccountCollection.deleteOne({ userId: new ObjectId(userId) }),
    ]);

    res
      .status(200)
      .json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Admin user delete api error", err);
    res.status(500).json({ success: false, message: "Interval server error" });
  }
});

//admin stats and analytics data GET API

app.get("/dashboard/admin", authorizationMiddleware,adminRoleVerifyMiddleware, async (req, res) => {
  try {
    const now = new Date();

    // Current month সহ last 6 calendar months
    // Example: September হলে April → September
    const sixMonthsAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
    );

    // =================================================
    // GET STATS + ANALYTICS
    // =================================================

    const [usersData, companiesData, jobsData] = await Promise.all([
      // =================================================
      // USERS
      // =================================================
      usersCollection
        .aggregate([
          {
            $facet: {
              // Total users
              totalUsers: [
                {
                  $count: "count",
                },
              ],

              // Total recruiters
              totalRecruiters: [
                {
                  $match: {
                    role: "recruiter",
                  },
                },
                {
                  $count: "count",
                },
              ],

              // Last 6 months new users
              monthlyUsers: [
                {
                  $match: {
                    createdAt: {
                      $gte: sixMonthsAgo,
                    },
                  },
                },
                {
                  $group: {
                    _id: {
                      year: {
                        $year: "$createdAt",
                      },
                      month: {
                        $month: "$createdAt",
                      },
                    },
                    count: {
                      $sum: 1,
                    },
                  },
                },
                {
                  $sort: {
                    "_id.year": 1,
                    "_id.month": 1,
                  },
                },
              ],
            },
          },
        ])
        .toArray(),

      // =================================================
      // COMPANIES
      // =================================================
      companiesCollection
        .aggregate([
          {
            $match: {
              status: "approved",
            },
          },
          {
            $count: "count",
          },
        ])
        .toArray(),

      // =================================================
      // JOBS
      // =================================================
      jobsCollection
        .aggregate([
          {
            $facet: {
              // Total jobs posted
              totalJobs: [
                {
                  $count: "count",
                },
              ],

              // Last 6 months job posts
              monthlyJobs: [
                {
                  $match: {
                    createdAt: {
                      $gte: sixMonthsAgo,
                    },
                  },
                },
                {
                  $group: {
                    _id: {
                      year: {
                        $year: "$createdAt",
                      },
                      month: {
                        $month: "$createdAt",
                      },
                    },
                    count: {
                      $sum: 1,
                    },
                  },
                },
                {
                  $sort: {
                    "_id.year": 1,
                    "_id.month": 1,
                  },
                },
              ],
            },
          },
        ])
        .toArray(),
    ]);

    // =================================================
    // EXTRACT RESULTS
    // =================================================

    const userResult = usersData[0];
    const jobResult = jobsData[0];

    const totalUsers = userResult.totalUsers[0]?.count ?? 0;

    const totalRecruiters = userResult.totalRecruiters[0]?.count ?? 0;

    const totalActiveCompanies = companiesData[0]?.count ?? 0;

    const totalJobs = jobResult.totalJobs[0]?.count ?? 0;

    // =================================================
    // CREATE LAST 6 MONTHS
    // =================================================

    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1),
      );

      return {
        year: date.getUTCFullYear(),
        monthNumber: date.getUTCMonth() + 1,
        month: date.toLocaleString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
      };
    });

    // =================================================
    // NEW USERS ANALYTICS
    // =================================================

    const newUsersAnalytics = months.map(({ year, monthNumber, month }) => {
      const found = userResult.monthlyUsers.find(
        (item) => item._id.year === year && item._id.month === monthNumber,
      );

      return {
        month,
        year,
        count: found?.count ?? 0,
      };
    });

    // =================================================
    // JOB POSTS ANALYTICS
    // =================================================

    const jobPostsAnalytics = months.map(({ year, monthNumber, month }) => {
      const found = jobResult.monthlyJobs.find(
        (item) => item._id.year === year && item._id.month === monthNumber,
      );

      return {
        month,
        year,
        count: found?.count ?? 0,
      };
    });

    // =================================================
    // RESPONSE
    // =================================================

    res.status(200).json({
      success: true,

      stats: {
        totalUsers,
        totalRecruiters,
        totalActiveCompanies,
        totalJobs,
      },

      analytics: {
        newUsers: newUsersAnalytics,
        jobPosts: jobPostsAnalytics,
      },
    });
  } catch (err) {
    console.error("Admin stats and analytics data get error", err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

export default app;
