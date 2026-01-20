import express from "express";
import multer from "multer";
import OpenAI from "openai";

const app = express();
const upload = multer();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json({ limit: "10mb" }));

app.post("/analyze-photo", upload.single("photo"), async (req, res) => {
  try {
    const imageBase64 = req.body.photoBase64;
    if (!imageBase64) return res.status(400).send({ error: "No photo provided" });

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Describe this photo and tell me what you like and dislike." },
            { type: "input_image", image_base64: imageBase64 },
          ],
        },
      ],
    });

    res.json({ result: response.output_text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI request failed" });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
