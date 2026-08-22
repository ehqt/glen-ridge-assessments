-- 1. What is actually in this 88k-row file? (2,400 parcels x ~36 years = ~86k)
SELECT mod_iv_munis_name, count(DISTINCT mod_iv_year) AS n_years,
       min(mod_iv_year) AS first_year, max(mod_iv_year) AS last_year, count(*) AS rows
FROM read_csv_auto('../data/raw/mod_iv_data.csv', all_varchar=true)
GROUP BY 1 ORDER BY rows DESC;

-- 2. How is "usable" encoded? Blank, or '00'?
SELECT coalesce(nullif(trim(sale_sr1a_non_usable_code), ''), '(blank)') AS nu,
       count(*) AS n
FROM read_csv_auto('../data/raw/mod_iv_data.csv', all_varchar=true)
WHERE TRY_CAST(sale_price AS BIGINT) > 1000
GROUP BY 1 ORDER BY n DESC LIMIT 15;

-- 3. Date shape: are leading zeros intact?
SELECT length(trim(deed_date_MMDDYY)) AS len, count(*) AS n,
       min(trim(deed_date_MMDDYY)) AS example
FROM read_csv_auto('../data/raw/mod_iv_data.csv', all_varchar=true)
WHERE TRY_CAST(sale_price AS BIGINT) > 1000
GROUP BY 1 ORDER BY len;
