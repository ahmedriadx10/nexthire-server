app.get("/seeker/saved-jobs/:seekerId", async (req, res) => {
  try {
    const { seekerId } = req.params;

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
});
