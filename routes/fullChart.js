const express = require("express");
const router = express.Router();
const { calcJulianDayAndCoords, calculateFullChart } = require("../utils/astrology");
const swisseph = require('swisseph');
const { DateTime } = require('luxon');
const tzlookup = require('tz-lookup');

// helper to convert a degree to a zodiac sign name
function degreeToSign(deg) {
  const signs = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  return signs[Math.floor((deg % 360) / 30)];
}

const { interpretChart } = require("../utils/interpreter");
const { saveChart } = require("../utils/firestore");

router.post("/", async (req, res) => {
  const { userId, birthDate, birthTime, birthPlace, latitude, longitude, dialect, withInterpretation } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: "Missing userId parameter" });
  }
  
  // Require birthDate; birthTime can be null but then we need a birthPlace (to geocode) or coordinates
  if (!birthDate || ((birthTime == null || birthTime === '') && (!birthPlace && (latitude == null || longitude == null)))) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    let julianDay, lat, lon, hasExactTime = false;
    
    // Check if we have both birth time and coordinates for precise calculation
    if (birthTime && birthTime !== '' && latitude != null && longitude != null) {
      // User provided coordinates and time directly - this should give full chart
      lat = Number(latitude);
      lon = Number(longitude);
      hasExactTime = true;

      // Determine timezone from coordinates.
      const zone = tzlookup(lat, lon);
      // Parse birthDate & birthTime in that zone.
      const dt = DateTime.fromFormat(
        `${birthDate} ${birthTime}`,
        'd LLLL yyyy h:mm a',
        { zone, setZone: true }
      );
      if (!dt.isValid) {
        return res.status(400).json({ error: `Invalid date/time: ${birthDate} ${birthTime}` });
      }
      // Convert to UTC and compute Julian Day.
      const utc = dt.toUTC();
      const jd = swisseph.swe_julday(
        utc.year, utc.month, utc.day,
        utc.hour + utc.minute / 60 + utc.second / 3600,
        swisseph.SE_GREG_CAL
      );
      const { delta } = swisseph.swe_deltat(jd);
      julianDay = Number(jd + delta / 86400);
    } else {
      // Fallback: use calcJulianDayAndCoords which handles null birthTime (defaults to noon) and geocoding
      const result = await calcJulianDayAndCoords(birthDate, birthTime, birthPlace);
      if (typeof result.julianDay !== "number" || isNaN(result.julianDay)) {
        return res.status(400).json({ error: "Invalid birth date or time; could not compute Julian Day" });
      }
      julianDay = result.julianDay;
      lat = result.lat;
      lon = result.lon;
      // If birthTime was provided to calcJulianDayAndCoords, we still have exact time
      hasExactTime = !!(birthTime && birthTime !== '');
    }

    // Calculate full chart
    const fullChart = await calculateFullChart({ julianDay, lat, lon, hasBirthTime: hasExactTime });
    const { ascendant, houses, planets } = fullChart;

    // Derive rising sign - only if we have exact time and ascendant
    const risingSign = (hasExactTime && ascendant) ? degreeToSign(ascendant) : null;
    
    // Label planets with sign & house number
    const labeledPlanets = planets.map(p => {
      const sign = degreeToSign(p.longitude);
      // Determine house: only if we have exact time and houses array
      let houseNumber = null;
      if (hasExactTime && Array.isArray(houses)) {
        const idx = houses.findIndex(cusp => p.longitude < cusp);
        houseNumber = idx >= 0 ? idx + 1 : 12;
      }
      return { ...p, sign, house: houseNumber };
    });

    let response = {
      julianDay,
      lat,
      lon,
      ascendant: hasExactTime ? ascendant : null,
      risingSign,
      houses: hasExactTime ? houses : null,
      planets: labeledPlanets,
      hasExactTime // Include this flag so you know what type of chart this is
    };

    if (withInterpretation && dialect) {
      try {
        const interpretation = await interpretChart({ chartData: response, dialect });
        response.interpretation = interpretation;
      } catch (interpretErr) {
        console.warn("🛑 Failed to generate interpretation:", interpretErr.message);
        response.interpretation = "Interpretation unavailable at the moment.";
      }
    }

    // Save this chart data to Firestore under the user's ID
    try {
      await saveChart(userId, response);
    } catch (fsErr) {
      console.warn("⚠️ Failed to save chart to Firestore:", fsErr);
    }

    return res.json(response);
  } catch (err) {
    console.error("🔥 Full chart calculation failed with error:", err);
    return res.status(500).json({ error: err.message || "Failed to calculate birth chart." });
  }
});

module.exports = router;