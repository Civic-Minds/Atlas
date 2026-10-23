# How Atlas data flows

A short map of where Atlas data comes from and which doc covers each step. Every doc is listed in the [documentation index](README.md).

1. **Feeds in.** The pipeline downloads each agency's GTFS schedule feed, from an official source or a fallback such as Transitland or the Mobility Database. [The Atlas pipeline](data/PIPELINE.md) describes how those feeds become frequency tiers, and [Route service metrics](data/ROUTE_SERVICE_METRICS.md) gives the exact meaning of each route field.
2. **Agencies covered.** [Agencies](data/AGENCIES.md) lists which agencies Atlas covers, [Adding agencies](data/ADDING_AGENCIES.md) is the procedure for adding one, and [Display naming](data/DISPLAY_NAMING.md) sets how an agency name is shown.
3. **Output out.** The pipeline writes static files (route data and map tiles) and publishes them together as one data release. [Updating the map](data/MAP_UPDATES.md) covers refreshing agencies and publishing the result. [Reprocessing shared route data](operations/DATA_REPROCESSING.md) covers full rebuilds and the release diff gate.
4. **Past schedules.** [History coverage](data/DATA_HISTORY.md) covers how Atlas chooses and keeps past schedule periods, and which agencies History includes.
5. **Rules for the data.** [Data principles](data/DATA_PRINCIPLES.md) states how fresh data must be and how corrections and live data are handled.
