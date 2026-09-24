# North America GTFS-Flex publication audit

Status: in progress. This is a companion to [the on-demand service audit](north-america-on-demand-audit-2026-09.md). It checks whether each confirmed public on-demand service has a current public GTFS-Flex feed, whether related data is available through an agency or municipal open-data portal, and how to request the data when no public feed is found.

## Classification

- **GTFS-Flex confirmed:** a current official feed or official download is publicly available and contains the relevant Flex data.
- **Other public feed/data:** the agency publishes GTFS or another open dataset, but the on-demand service is not confirmed in GTFS-Flex.
- **No public feed found:** official agency and relevant open-data sources were checked, but no current public GTFS-Flex publication was found.
- **Request path:** official email, form, data portal, or contact route to ask for publication or access.
- **Unresolved:** the agency or portal could not be verified sufficiently and needs a follow-up pass.

## Atlas baseline

The current Atlas inventory contains four feed URLs whose paths include `flex`; all four are Colorado feeds from Trillium Transit. This is only a feed-URL clue, not proof that every relevant on-demand service is represented in GTFS-Flex. The audit will verify the actual feed contents and the agencies in the on-demand service list separately.

## Canada

Canada is the first research batch. Results will be added by province and agency, with official feed, open-data, and contact links.

### Ontario — initial results

| Atlas agency/service | GTFS-Flex status | Agency/open-data finding | Request path | Evidence |
| --- | --- | --- | --- | --- |
| Hamilton Street Railway — myRide On-Demand | No public GTFS-Flex feed confirmed | Hamilton publishes current GTFS static and GTFS-RT files through the City open-data host. The public directory also exposes trip modifications, but the available page does not identify a GTFS-Flex schedule feed. | HSR feedback email is listed on the myRide page; use it to ask whether myRide is represented in the static feed or whether a Flex export is available. | [HSR myRide](https://www.hamilton.ca/home-neighbourhood/hsr/schedule-route-tools/hsr-myride-demand), [Hamilton GTFS static](https://opendata.hamilton.ca/GTFS-Static/), [Hamilton GTFS-RT](https://opendata.hamilton.ca/GTFS-RT/) |
| York Region Transit — On-Request | No public GTFS-Flex feed confirmed | YRT publishes GTFS and real-time GTFS through its open-data page, with all YRT routes included in the package. The public page does not identify the On-Request service as GTFS-Flex. | Complete YRT’s GTFS Data Online Form, then ask YRT whether the On-Request booking zones/rules are encoded in the current package or available as a Flex supplement. | [YRT Open Data](https://www.yrt.ca/en/about-us/open-data.aspx), [YRT GTFS licence and form](https://www.yrt.ca/en/about-us/open-data-licence-agreement.aspx), [YRT On-Request](https://www.yrt.ca/en/schedules-and-maps/on-request-service.aspx) |

These are preliminary classifications, not claims that the feeds lack the data internally; the downloaded ZIP contents still need to be inspected where the feed is publicly downloadable. GTFS-Flex is the official GTFS extension for flexible and demand-responsive services, including booking rules and zone-based service. [GTFS-Flex overview](https://gtfs.org/community/extensions/overview/)
