app.get("/recruiter/job-applicants/:jobId", async (req, res) => {
  try {
    const { jobId='6a69cd96075f377e6c6b75e2' } = req.params;

    const { status, page = 1 } = req.query;

    const pageNumber = Math.max(parseInt(page), 1);
    const LIMIT = 10;

    const skip = (pageNumber - 1) * LIMIT;

    const matchCondition = {
      jobId: new ObjectId(jobId), // joId is string inside applications collection
    };

    // only
    if (status) {
      matchCondition.status = status;
    }

    const result = await applicationsCollection
      .aggregate([
        // Stage 1
        {
          $match: matchCondition,
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
           companyId:0,
           coverLetter:0,
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
                  $arrayElemAt: [
                    "$metadata.totalApplications",
                    0,
                  ],
                },
                0,
              ],
            },
          },
        },
      ])
      .toArray();

    const data = result[0];

    const totalApplications =
      data?.totalApplications || 0;

    const totalPages = Math.ceil(
      totalApplications / LIMIT
    );

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