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

### Minnesota

| Atlas agency/service | GTFS-Flex status | Agency/open-data finding | Request path | Evidence |
| --- | --- | --- | --- | --- |
| Metro Transit (Minneapolis–Saint Paul) — Metro micro | **GTFS-Flex confirmed** | Metro Transit publishes a dedicated current `gtfs-flex.zip` URL explicitly labeled “GTFS-Flex - Metro Micro Service schedule,” separately from its ordinary static feed. | No request needed for the published schedule. | [Metro Transit schedule and realtime feeds](https://svc.metrotransit.org/), [direct GTFS-Flex feed](https://svc.metrotransit.org/mtgtfs/gtfs-flex.zip) |
| Minnesota Valley Transit Authority — MVTA Connect | No public GTFS-Flex feed confirmed | Metro Transit’s regional data page links to MVTA’s ordinary GTFS and realtime feeds, but does not identify an MVTA GTFS-Flex feed. | Ask MVTA whether MVTA Connect is included in the ordinary package or available as a separate Flex export through its [contact page](https://www.mvta.com/contact/). | [MVTA feed link from Metro Transit](https://svc.metrotransit.org/), [MVTA Connect](https://www.mvta.com/connect/), [MVTA contact](https://www.mvta.com/contact/) |

### Washington

| Atlas agency/service | GTFS-Flex status | Agency/open-data finding | Request path | Evidence |
| --- | --- | --- | --- | --- |
| King County Metro — Metro Flex | No public GTFS-Flex download confirmed; public open data exists | King County publishes the ordinary Metro GTFS feed and a separate Metro Flex open-data dataset containing service-area geometry. The public GTFS directory does not expose a Flex ZIP alongside the ordinary feed. | Ask Metro’s developer/open-data contact whether the Flex geometry is also available as a GTFS-Flex package or whether the service is intentionally published only as GIS/open-data geometry. | [Metro GTFS directory](https://metro.kingcounty.gov/gtfs/), [King County Metro Flex open data](https://data.kingcounty.gov/w/3jjm-4frb/shwn-npxw?cur=fxqU9OHpgRi&from=u_AVX81Z7j0), [Metro developer resources](https://cdn.kingcounty.gov/uk-ua/dept/metro/rider-tools/mobile-and-web-apps) |

### Utah

| Atlas agency/service | GTFS-Flex status | Agency/open-data finding | Request path | Evidence |
| --- | --- | --- | --- | --- |
| Utah Transit Authority — UTA On Demand | No public GTFS-Flex download confirmed | UTA publishes an open-data portal and ordinary GTFS references. A UTA procurement document confirms that its trip-planning system must support UTA On Demand through an API or GTFS-Flex, but that is not itself a public Flex publication. | Request the UTA On Demand Flex export through [UTA customer service](https://www.rideuta.com/Rider-Info/Contact-Us) or `rideuta@rideuta.com`; UTA also provides a public-records route for data requests. | [UTA trip-planning requirement](https://www.utah.gov/pmn/files/1184939.pdf), [UTA contact](https://www.rideuta.com/Rider-Info/Contact-Us), [UTA terms/open-data reference](https://satellites.rideuta.com/About-UTA/Terms-of-Use) |

### Additional U.S. initial results

| Atlas agency/service | GTFS-Flex status | Agency/open-data finding | Request path | Evidence |
| --- | --- | --- | --- | --- |
| Los Angeles County Metropolitan Transportation Authority — Metro Micro | No public GTFS-Flex download confirmed | LA Metro publishes an API and ordinary static/realtime GTFS resources. Vendor material indicates Metro Micro can be represented through a vendor-generated Flex feed, but I found no Metro-hosted public Flex download. | Ask Metro Customer Relations or the developer-data team whether the Metro Micro Flex export can be published or shared. | [Metro API](https://api.metro.net/), [Metro contacts](https://www.metro.net/about/contacts/), [Metro Micro guide](https://www.metro.net/riding/micro/micro-guide/) |
| Kansas City Area Transportation Authority — RideKC Micro Transit / IRIS | No public GTFS-Flex feed confirmed | RideKC publishes a current ordinary static GTFS feed and invites requests for other service data; its open-data page does not identify a Flex feed. | Contact KCATA through the RideKC open-data page and request the Micro Transit/IRIS Flex dataset or zone GeoJSON. | [RideKC Open Data](https://ridekc.org/open-data/), [RideKC on-demand services](https://ridekc.org/getting-around/services/on-demand-services/) |
| WeGo Public Transit / Nashville MTA — WeGo Link | No public GTFS-Flex feed confirmed | WeGo’s developer-data page offers GTFS static and GTFS-RT through a request form. The public listing does not identify a GTFS-Flex package, although WeGo’s procurement materials describe zone data supplied to its service contractor. | Submit the [WeGo developer data request](https://www.wegotransit.com/contact-us/developer-data-requests/) and specifically request WeGo Link zones, booking rules, and any GTFS-Flex export. | [WeGo developer data requests](https://www.wegotransit.com/contact-us/developer-data-requests/), [WeGo Link procurement specification](https://www.wegotransit.com/assets/bidpostingdocuments/FINAL%20RFP%20DEMAND%20Response.pdf) |
