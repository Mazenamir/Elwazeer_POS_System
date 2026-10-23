-- Migration 015: Standardize and assign specific logo URLs to each branch
-- Ensures branches (Antalya, El Wazer, Damanhour Women, Damanhour Men, Main Warehouse)
-- have clean static asset logo URLs rather than bloated base64 or mismatched defaults.

UPDATE branches SET logo_url = '/logos/app-icon.png' 
WHERE id = 1 OR is_main_warehouse = TRUE;

UPDATE branches SET logo_url = '/logos/Antalya logo.png' 
WHERE id = 2 OR LOWER(TRIM(name)) = 'antalya';

UPDATE branches SET logo_url = '/logos/elwazer.png' 
WHERE id = 3 OR LOWER(TRIM(name)) IN ('el wazer', 'elwazer', 'الوزير');

UPDATE branches SET logo_url = '/logos/men.png' 
WHERE id = 4 OR LOWER(TRIM(name)) = 'elraml';

UPDATE branches SET logo_url = '/logos/men.png' 
WHERE id = 5 OR LOWER(TRIM(name)) = 'beshr';

UPDATE branches SET logo_url = '/logos/men.png' 
WHERE id = 6 OR LOWER(TRIM(name)) = 'moharm bek';

UPDATE branches SET logo_url = '/logos/men.png' 
WHERE id = 7 OR LOWER(TRIM(name)) = 'el amrya';

UPDATE branches SET logo_url = '/logos/men.png' 
WHERE id = 8 OR LOWER(TRIM(name)) = 'al agamy';

UPDATE branches SET logo_url = '/logos/men.png' 
WHERE id = 9 OR LOWER(TRIM(name)) IN ('damnhor man', 'دمنهور رجالي', 'دمنهور الرجالي');

UPDATE branches SET logo_url = '/logos/women.png' 
WHERE id = 10 OR LOWER(TRIM(name)) IN ('damnhor woman', 'دمنهور حريمي', 'دمنهور الحريمي', 'forher');
