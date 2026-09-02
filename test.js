app.get("/dashboard/seeker/:seekerId", async (req, res) => {
  try {
    const { seekerId } = req.params;

    // 1. Authentication / authorization check
    // Make sure logged-in seeker can access only his own dashboard.

    const [
      savedJobsResult,
      applicationsResult,
      latestJobs,
      profile
    ] = await Promise.all([
      // Saved jobs count
      savedJobsCollection.countDocuments({
        userId: seekerId
      }),

      // Applications:
      // - total applications
      // - interview count
      // - rejected count
      // - latest 5 except applied & withdrawn
      applicationsCollection.aggregate([
        {
          $match: {
            seekerId
          }
        },
        {
          $facet: {
            stats: [
              {
                $group: {
                  _id: null,

                  totalApplications: {
                    $sum: 1
                  },

                  totalInterview: {
                    $sum: {
                      $cond: [
                        { $eq: ["$status", "interview"] },
                        1,
                        0
                      ]
                    }
                  },

                  totalRejected: {
                    $sum: {
                      $cond: [
                        { $eq: ["$status", "rejected"] },
                        1,
                        0
                      ]
                    }
                  }
                }
              }
            ],

            latestApplications: [
              {
                $match: {
                  status: {
                    $nin: ["applied", "withdrawn"]
                  }
                }
              },
              {
                $sort: {
                  updatedAt: -1,
                  createdAt: -1
                }
              },
              {
                $limit: 5
              }
            ]
          }
        }
      ]).toArray(),

      // Latest 5 active jobs
      jobsCollection
        .find({
          status: "active"
        })
        .sort({
          createdAt: -1
        })
        .limit(5)
        .toArray(),

      // Seeker profile
      seekersProfileCollection.findOne({
        seekerId
      })
    ]);

    // Extract application aggregation result
    const applicationData = applicationsResult[0] || {};

    const stats = applicationData.stats?.[0] || {
      totalApplications: 0,
      totalInterview: 0,
      totalRejected: 0
    };

    const latestApplications =
      applicationData.latestApplications || [];

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalSavedJobs: savedJobsResult,
          totalApplications: stats.totalApplications,
          totalInterview: stats.totalInterview,
          totalRejected: stats.totalRejected
        },

        latestJobs,

        profile,

        latestApplications
      }
    });

  } catch (err) {
    console.error("seeker dashboard stats get API error", err);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});