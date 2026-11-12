# FEMA Disasters for Gladys Assistant

The FEMA disaster declarations of your US county in [Gladys Assistant](https://gladysassistant.com):
hurricanes, floods, fires, winter storms, tornadoes, and the aid programs they open (Individual
Assistance, Public Assistance, Hazard Mitigation), read from
[OpenFEMA](https://www.fema.gov/about/openfema/api). No account, no API key.

Declarations are administrative decisions, often made days after the event: this is not a safety
alert system. Not affiliated with FEMA. This product uses the FEMA OpenFEMA API, but is not endorsed
by FEMA.

## Features

- **One device per county** (the county of your house, or up to 8 FIPS codes): disaster declared,
  incident type and date of the latest declaration, Individual Assistance (registration open),
  Public Assistance, Hazard Mitigation, number of declarations over 12 months.
- **Scene triggers**: a new declaration for a followed county (filtered by county and declaration
  type: major disaster, emergency, fire management), and Individual Assistance opened, with the
  registration deadline, at once or by a later amendment.
- **Scene action**: the active declarations as one sentence, with their number and whether
  assistance is open.
- **Dashboard widget**: one row per county, its active declarations, programs, deadline, and links
  to the FEMA page of each disaster and to DisasterAssistance.gov.
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.3 or later.
- Internet access from the Gladys host (`www.fema.gov`, and `geo.fcc.gov` for the county of the
  house).
- A house in the United States (location in Gladys), or county FIPS codes in the configuration.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-fema` (or install it from the catalog once it is listed). The
   install screen shows the **location** access it asks for (to find the county of the house).
2. In **Configuration**, leave the county field empty (county of the house) or type FIPS codes, then
   save. **Show the current declarations** answers right away.
3. Open the **Discover** tab and add the device of each county.

The user guide is in [`docs/en.md`](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md),
[español](docs/es.md)); Gladys links it from the Configuration screen.

## How it works

```
Integration container ──HTTPS──▶ www.fema.gov   api/open/v2/DisasterDeclarationsSummaries
      │                 ──HTTPS──▶ geo.fcc.gov    api/census/area (county of the house, once)
      │ SDK (WebSocket + host API)
      ▼
Gladys core ── devices, states, scene events, scene action, widget
```

- Every 30 minutes to 6 hours (1 hour by default), one OpenFEMA request per county: the
  declarations of the county and the statewide ones of its state. Tribal declarations are left
  out. The devices are published with `should_poll: false`: the container keeps its own timer
  (GladysAssistant/Gladys#3198).
- A declaration is active when it is not closed out and was made less than 30 days ago, or its
  incident period is open, or its Individual Assistance registration is open.
- County codes are checked against the Census Bureau 2020 list shipped in `src/counties.json`, the
  vintage FEMA uses.
- The declarations seen are kept under `/data`, so a restart fires no trigger; those already there
  when a county is first followed are not news either.

## Limitations

- Declarations say where federal aid goes, not where danger is: for warnings, see the National
  Weather Service.
- Disaster Recovery Centers are not listed.
- Declaration titles and county names stay in English.
- Tested against the real OpenFEMA service and the SDK's fake Gladys; not yet on a real Gladys
  instance: feedback welcome.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake OpenFEMA serving real declarations recorded on
12/11/2026 (`test/fixtures/openfema/`, Bay County, Florida, and Hot Springs County, Wyoming): never
the network.

## Credits

- Data: [OpenFEMA](https://www.fema.gov/about/openfema/data-sets), US Federal Emergency Management
  Agency, public domain; see the
  [OpenFEMA terms and conditions](https://www.fema.gov/about/openfema/terms-conditions). The
  Federal Government or FEMA cannot vouch for the data or analyses derived from these data after
  the data have been retrieved from the Agency's website(s).
- County of the house: [FCC Area API](https://geo.fcc.gov/api/census/). County codes: US Census
  Bureau.
- Built on the [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js) and
  the official JavaScript template.

## License

[Apache 2.0](LICENSE).
