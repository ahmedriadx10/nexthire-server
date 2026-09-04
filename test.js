app.get("/admin/users", async (req, res) => {
  try {
    const {
      search = "",
      role = "",
      page = 1,
    } = req.query;

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
    const allowedRoles = [
      "seeker",
      "recruiter",
      "admin",
    ];

    if (allowedRoles.includes(role)) {
      query.role = role;
    }

    // Last 24 hours
    const last24Hours = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    );

    // --------------------------------
    // Aggregation
    // --------------------------------

    const result = await userCollection
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
                          $gte: [
                            "$createdAt",
                            last24Hours,
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

    const totalFilteredUsers =
      data.totalFilteredUsers[0]?.count || 0;

    const stats = data.stats[0] || {
      totalUsers: 0,
      totalRecruiters: 0,
      totalSeekers: 0,
      last24HoursSignups: 0,
    };

    const totalPages = Math.ceil(
      totalFilteredUsers / limit
    );

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
    console.error(
      "Admin all users data get error",
      err
    );

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});