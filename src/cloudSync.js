function cloudEndpoint() {
  const baseUrl = process.env.NORTH_STAR_CLOUD_URL?.trim().replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/api/opportunities` : null;
}

async function uploadOpportunities(opportunities) {
  const endpoint = cloudEndpoint();

  if (!endpoint) {
    console.log(
      "☁️ Cloud upload skipped: NORTH_STAR_CLOUD_URL is not configured."
    );
    return { skipped: true };
  }

  const uploadKey = process.env.NORTH_STAR_UPLOAD_KEY?.trim();

  if (!uploadKey) {
    throw new Error(
      "NORTH_STAR_UPLOAD_KEY is required when NORTH_STAR_CLOUD_URL is set."
    );
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${uploadKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(opportunities),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Cloud upload failed (HTTP ${response.status}): ${
        result.error || "Unknown error"
      }`
    );
  }

  console.log(
    `☁️ Uploaded ${result.count ?? opportunities.length} opportunities to the cloud.`
  );

  return result;
}

export { uploadOpportunities };
