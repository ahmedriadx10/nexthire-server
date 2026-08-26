app.get("/jobs/:jobId", async (req, res) => {
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

    const userObjectId =
      isSeeker && req.user?.id
        ? new ObjectId(req.user?.id)
        : null;

    const pipeline = [
      // Stage 1
      {
        $match: {
          _id: jobObjectId,
        },
      },

      // Stage 2
      {
        $lookup: {
          from: "company",
          localField: "companyId",
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
      pipeline.push({
        $lookup: {
          from: "applications",
          let: {
            jobId: "$_id",
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
                      $eq: ["$userId", userObjectId],
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
      });
    }

    // Final projection
    pipeline.push({
      $project: {
        _id: 1,
        title: 1,
        description: 1,
        jobType: 1,
        location: 1,
        salary: 1,
        requirements: 1,
        responsibilities: 1,
        skills: 1,
        deadline: 1,
        createdAt: 1,

        company: {
          _id: "$company._id",
          name: "$company.name",
          industry: "$company.industry",
          website: "$company.website",
          logo: "$company.logo",
        },

        isApplied: isSeeker
          ? {
              $gt: [
                {
                  $size: "$application",
                },
                0,
              ],
            }
          : false,

        permission: {
          canApply: isSeeker,
        },
      },
    });

    const result = await jobsCollection
      .aggregate(pipeline)
      .toArray();

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