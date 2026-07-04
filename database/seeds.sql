-- =============================================================================
-- gtfs_app seed data
-- Run AFTER schema.sql on a fresh database:
--   docker exec -i gtfs-db psql -U admin -d gtfs_app < database/seeds.sql
--
-- WARNING: this TRUNCATES gtfs_regions and resets the sequence.
--          Existing region data will be lost. User records are left untouched.
--
-- No default admin is seeded. Create one with:
--   cd backend && python scripts/create_admin.py admin@example.com
-- =============================================================================

BEGIN;

TRUNCATE gtfs_regions RESTART IDENTITY CASCADE;

INSERT INTO gtfs_regions (id, name, country, city, static_url, rt_url) VALUES

  -- Poland — Tricity (Gdańsk / Gdynia / Sopot share the TriStar RT feed)
  (1,  'ZTM Gdańsk',        'PL', 'Gdańsk',
       'https://ckan.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/30e783e4-2bec-4a7d-bb22-ee3e3b26ca96/download/gtfsgoogle.zip',
       'http://ckan2.multimediagdansk.pl/gtfs-rt?feed=tripUpdates'),

  (2,  'ZKM Gdynia',        'PL', 'Gdynia',
       'https://mkuran.pl/gtfs/tristar.zip',
       'http://ckan2.multimediagdansk.pl/gtfs-rt?feed=tripUpdates'),

  (3,  'ZKM Sopot',         'PL', 'Sopot',
       'https://mkuran.pl/gtfs/tristar.zip',
       'http://ckan2.multimediagdansk.pl/gtfs-rt?feed=tripUpdates'),

  -- Poland — major cities
  (4,  'ZTM Warszawa',      'PL', 'Warszawa',
       'https://mkuran.pl/gtfs/warsaw.zip',
       'https://mkuran.pl/gtfs/warsaw/vehicles.pb'),

  (5,  'ZTP Kraków',        'PL', 'Kraków',
       'https://gtfs.ztp.krakow.pl/GTFS_KRK_A.zip',
       NULL),

  (6,  'ZTM Poznań',        'PL', 'Poznań',
       'https://www.ztm.poznan.pl/pl/dla-deweloperow/getGTFSFile',
       NULL),

  (7,  'MPK Wrocław',       'PL', 'Wrocław',
       'https://www.wroclaw.pl/open-data/opendata/rozklady/OtwartyWroclaw_rozklad_jazdy_GTFS.zip',
       NULL),

  -- Poland — mkuran.pl aggregated feeds
  (8,  'MPK Lublin',        'PL', 'Lublin',
       'https://mkuran.pl/gtfs/lublin.zip',
       NULL),

  (9,  'ZDMiKP Bydgoszcz',  'PL', 'Bydgoszcz',
       'https://mkuran.pl/gtfs/bydgoszcz.zip',
       NULL),

  (10, 'MZK Toruń',         'PL', 'Toruń',
       'https://mkuran.pl/gtfs/torun.zip',
       NULL),

  (11, 'PKP Intercity',     'PL', 'Warszawa',
       'https://mkuran.pl/gtfs/pkpic.zip',
       NULL),

  (12, 'Koleje Mazowieckie','PL', 'Warszawa',
       'https://mkuran.pl/gtfs/kolejemazowieckie.zip',
       NULL),

  -- Central / Northern Europe
  (13, 'PID Praha',         'CZ', 'Praha',
       'http://data.pid.cz/PID_GTFS.zip',
       NULL),

  (14, 'Wiener Linien',     'AT', 'Wien',
       'https://www.wienerlinien.at/ogd_realtime/doku/ogd/gtfs/gtfs.zip',
       NULL),

  (15, 'HSL Helsinki',      'FI', 'Helsinki',
       'https://api.digitransit.fi/routing-data/v2/hsl/HSL.zip',
       'https://realtime.hsl.fi/realtime/trip-updates/v2/hsl'),

  -- Western / Southern Europe
  (16, 'Metro Madrid',      'ES', 'Madrid',
       'https://crtm.maps.arcgis.com/sharing/rest/content/items/5c7f2951962540d69ffe8f640d94c246/data',
       NULL),

  (17, 'Carris Lisboa',     'PT', 'Lisboa',
       'https://www.carris.pt/media/xeftpfnq/gtfs.zip',
       NULL),

  -- Germany
  (18, 'DELFI Germany',     'DE', 'Dortmund',
       'https://scraped.data.public-transport.earth/de/gtfs.zip',
       NULL),

  (19, 'VBB Berlin',        'DE', 'Berlin',
       'https://www.vbb.de/vbbgtfs',
       NULL),

  (20, 'MVV München',       'DE', 'München',
       'https://www.mvv-muenchen.de/fileadmin/mediapool/02-Fahrplanauskunft/03-Downloads/openData/gesamt_gtfs.zip',
       NULL),

  (21, 'VGN Nürnberg',      'DE', 'Nürnberg',
       'https://www.vgn.de/opendata/GTFS.zip',
       NULL),

  -- France
  (22, 'IDFM Paris',        'FR', 'Paris',
       'https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip',
       NULL),

  (23, 'TCL Lyon',          'FR', 'Lyon',
       'https://download.data.grandlyon.com/files/rdata/tcl_sytral.tcltheorique/GTFS_TCL.ZIP',
       NULL),

  -- Spain
  (24, 'EMT Madrid',        'ES', 'Madrid',
       'https://datos.emtmadrid.es/dataset/9b23259a-4491-494b-9695-36a7709b2c12/resource/3cba2058-9833-422c-a704-bf992d31d2ee/download/gtfs_emt.zip',
       NULL),

  -- Portugal
  (25, 'STCP Porto',        'PT', 'Porto',
       'https://opendata.porto.digital/dataset/5275c986-592c-43f5-8f87-aabbd4e4f3a4/resource/415bf8d5-4c18-40b3-9516-9d9187185ef9/download/gtfs_stcp.zip',
       NULL);

-- Keep sequence in sync with the inserted IDs
SELECT setval('gtfs_regions_id_seq', (SELECT MAX(id) FROM gtfs_regions));

COMMIT;
