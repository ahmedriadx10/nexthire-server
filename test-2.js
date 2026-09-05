app.get("/dashboard/admin", async (req, res) => {
  try {
    const now = new Date();

    // Last 6 months including current month
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Generate month labels for the last 6 months
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(
        now.getFullYear(),
        now.getMonth() - (5 - index),
        1
      );

      return {
        start: date,
        label: date.toLocaleString("en-US", {
          month: "short",
          year: "numeric",
        }),
      };
    });

    const [userData, companyData, jobData] = await Promise.all([
      // =========================
      // USERS
      // =========================
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
              newUsers: [
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
                      $dateTrunc: {
                        date: "$createdAt",
                        unit: "month",
                      },
                    },
                    count: {
                      $sum: 1,
                    },
                  },
                },
                {
                  $sort: {
                    _id: 1,
                  },
                },
              ],
            },
          },
        ])
        .toArray(),

      // =========================
      // COMPANIES
      // =========================
      companiesCollection
        .aggregate([
          {
            $facet: {
              // Active / approved companies
              totalActiveCompanies: [
                {
                  $match: {
                    status: "approved",
                  },
                },
                {
                  $count: "count",
                },
              ],
            },
          },
        ])
        .toArray(),

      // =========================
      // JOBS
      // =========================
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
              jobPosts: [
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
                      $dateTrunc: {
                        date: "$createdAt",
                        unit: "month",
                      },
                    },
                    count: {
                      $sum: 1,
                    },
                  },
                },
                {
                  $sort: {
                    _id: 1,
                  },
                },
              ],
            },
          },
        ])
        .toArray(),
    ]);

    // ==========================================
    // Extract aggregation results
    // ==========================================

    const usersResult = userData[0];
    const companiesResult = companyData[0];
    const jobsResult = jobData[0];

    // ==========================================
    // Create 6-month analytics with zero values
    // ==========================================

    const newUsersAnalytics = months.map((month) => {
      const found = usersResult.newUsers.find(
        (item) =>
          item._id.getTime() === month.start.getTime()
      );

      return {
        month: month.label,
        count: found?.count || 0,
      };
    });

    const jobPostsAnalytics = months.map((month) => {
      const found = jobsResult.jobPosts.find(
        (item) =>
          item._id.getTime() === month.start.getTime()
      );

      return {
        month: month.label,
        count: found?.count || 0,
      };
    });

    // ==========================================
    // Final response
    // ==========================================

    res.status(200).json({
      success: true,

      stats: {
        totalUsers: usersResult.totalUsers[0]?.count || 0,
        totalRecruiters:
          usersResult.totalRecruiters[0]?.count || 0,
        totalActiveCompanies:
          companiesResult.totalActiveCompanies[0]?.count || 0,
        totalJobs:
          jobsResult.totalJobs[0]?.count || 0,
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