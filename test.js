app.get("/admin/companies", async (req, res) => {
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
    const filterReadyStatus=status?.trim()?.toLowerCase() || '';
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

    const totalFilteredCompanies =
      data.filteredCount[0]?.count || 0;

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