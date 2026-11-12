# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]

### Added

- FEMA disaster declarations of your US county, read from OpenFEMA without an account: one device
  per county (the county of your house, found once through the FCC Area API, or up to 8 FIPS
  codes) with disaster declared, incident type and date of the latest declaration, Individual
  Assistance (registration open), Public Assistance, Hazard Mitigation and the number of
  declarations over 12 months.
- Scene triggers: a new declaration for a followed county (filtered by county and declaration
  type), and Individual Assistance opened, with the registration deadline.
- Scene action: the active declarations as one sentence, with their number and whether assistance
  is open.
- Dashboard widget: one row per county, its active declarations, programs, deadline and links.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-fema/commits/main
