from flask import Flask, request, jsonify
import joblib

# Load model and vectorizer using joblib
model = joblib.load("logistic_model.pkl")
vectorizer = joblib.load("tfidf_vectorizer.pkl")

app = Flask(__name__)

@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    text = data.get("text", "")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    vectorized = vectorizer.transform([text])
    prediction = int(model.predict(vectorized)[0])
    probability = float(model.predict_proba(vectorized).max())

    return jsonify({"prediction": prediction, "confidence": round(probability, 4)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
