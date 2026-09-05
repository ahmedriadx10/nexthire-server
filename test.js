app.get("/dashboard/admin", async (req, res) => {
  try {
    const now = new Date();

    // Current month সহ last 6 calendar months
    // Example: September হলে April → September
    const sixMonthsAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)
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

    const totalUsers =
      userResult.totalUsers[0]?.count ?? 0;

    const totalRecruiters =
      userResult.totalRecruiters[0]?.count ?? 0;

    const totalActiveCompanies =
      companiesData[0]?.count ?? 0;

    const totalJobs =
      jobResult.totalJobs[0]?.count ?? 0;

    // =================================================
    // CREATE LAST 6 MONTHS
    // =================================================

    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() - 5 + index,
          1
        )
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

    const newUsersAnalytics = months.map(
      ({ year, monthNumber, month }) => {
        const found = userResult.monthlyUsers.find(
          (item) =>
            item._id.year === year &&
            item._id.month === monthNumber
        );

        return {
          month,
          year,
          count: found?.count ?? 0,
        };
      }
    );

    // =================================================
    // JOB POSTS ANALYTICS
    // =================================================

    const jobPostsAnalytics = months.map(
      ({ year, monthNumber, month }) => {
        const found = jobResult.monthlyJobs.find(
          (item) =>
            item._id.year === year &&
            item._id.month === monthNumber
        );

        return {
          month,
          year,
          count: found?.count ?? 0,
        };
      }
    );

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
    console.error(
      "Admin stats and analytics data get error",
      err
    );

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});