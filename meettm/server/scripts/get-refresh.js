import fetch from "node-fetch";

const clientId = "004bba793bd842c6be3c9a28a60e5def";
const clientSecret = "460f85e5069b494ab54b331fe3a8fd3c";
const redirectUri = "http://localhost:3000/callback";  // la fel ca în dashboard
const code = "AQBVNLXoernRiT8lGJMIYlnPfZlkyJKe4fNlypEO_TCWf7thDs-FazdvydC1xtUF7-B0rTDGrniLYcLPlKzhW3AGK__ivuKS-4AwvIx7KVqWx-WQx2prCRe1R_os0ZkmQNDZxSboehn9U2CUjiWgLjGh6N1xJewLsfJFtKBfJjDGsBZXhvQ7VyRlfWBMKHmlp2lyiFMQCjrq5nvYWRJKc_vHJ-nHZF_cgiJIu2F5nU6bqBsTtiaL-FrIxwfDLtzT15f829FZbo0etdO5f38hd-F8nu1r2I5iz3-GHuA8LKUU1Svk5WPdhQsn";

async function main() {
  const tokenUrl = "https://accounts.spotify.com/api/token";

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const json = await res.json();
  console.log(json);
}

main().catch(console.error);
