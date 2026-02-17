import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

/**
 * === MAPPINGS ===
 */

const formationCheckboxMap = {
  "coach professionnel rncp": "COACHING",
  "formateur professionnel rncp": "FORMATEUR",
  "fondamentaux du coaching": "COACHING",
  "hypnothérapeute": "PRATICIEN_TB",
  "psychopraticien": "PRATICIEN_TB",
  "les fondamentaux de la relation d'aide": "PRATICIEN_TB"
};



/**
 * === ZOHO AUTH ===
 */
async function getAccessToken() {
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  const url = `https://accounts.zoho.eu/oauth/v2/token?refresh_token=${ZOHO_REFRESH_TOKEN}&client_id=${ZOHO_CLIENT_ID}&client_secret=${ZOHO_CLIENT_SECRET}&grant_type=refresh_token`;
  const response = await axios.post(url);
  return response.data.access_token;
}

/**
 * === SEARCH DUPLICATE IN CONTACTS ===
 */
async function existsInContacts(email, token) {
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  const res = await axios.get(
    `https://www.zohoapis.eu/crm/v2/Contacts/search?criteria=(Email:equals:${email})`,
    { headers }
  ).catch(() => null);

  return !!res?.data?.data?.length;
}

/**
 * === CREATE CONTACT ===
 */
async function createContact(payload, token) {
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };


  const formationName = payload.formation?.name?.toLowerCase() || "";
  const checkboxField = formationCheckboxMap[formationName];

  const contact = {
    First_Name: payload.firstname,
    Last_Name: payload.lastname,
    Email: payload.email,
    Phone: payload.phone,
    Mailing_Zip: payload.zipcode,
    Mailing_City: payload.city,
    Projet_professionnel:payload.profile.professional_situation,
    Niveau_d_tudes:payload.profile.education_level,
    ...(checkboxField ? { [checkboxField]: true } : {})
  };

  const res = await axios.post(
    "https://www.zohoapis.eu/crm/v2/Contacts",
    { data: [contact] },
    { headers }
  );

  return res.data.data[0].details.id;
}

/**
 * === WEBHOOK ENDPOINT ===
 */
app.post("/webhook/jcdm", async (req, res) => {
  try {
    const payload = req.body;
    if (!payload?.email) {
      return res.status(500).json({ status: "error", message: "Email manquant" });
    }

    const token = await getAccessToken();
    const exists = await existsInContacts(payload.email, token);

    if (exists) {
      return res.status(409).json({
        status: "duplicate",
        message: "Lead déjà présent"
      });
    }

    const contactId = await createContact(payload, token);

    return res.status(200).json({
      status: "success",
      contact_id: contactId
    });

  } catch (err) {
    console.error("Erreur webhook:", err.response?.data || err.message);
    return res.status(500).json({ status: "error", message: "Erreur technique" });
  }
});

app.get("/", (_, res) => res.send("Webhook JCDM OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on " + PORT));
