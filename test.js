app.get("/seeker/applications/:seekerId", async (req, res) => {
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
                    $cond: [
                      { $eq: ["$status", "shortlisted"] },
                      1,
                      0,
                    ],
                  },
                },

                totalInterview: {
                  $sum: {
                    $cond: [
                      { $eq: ["$status", "interview"] },
                      1,
                      0,
                    ],
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
                          $divide: [
                            "$totalInterview",
                            "$totalApplied",
                          ],
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

    const result = await applicationsCollection
      .aggregate(pipeline)
      .toArray();

    const data = result[0];

    const stats = data.stats[0] || {
      totalApplied: 0,
      totalShortlisted: 0,
      totalInterview: 0,
      successRate: 0,
    };

    const totalApplications =
      data.metadata[0]?.totalApplications || 0;

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