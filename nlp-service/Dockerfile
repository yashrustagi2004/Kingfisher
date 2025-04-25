# Use a more complete base image
FROM python:3.10-slim

# Copy your project files
COPY . .

# Install system dependencies required for scikit-learn
RUN pip install --no-cache-dir -r requirements.txt 

# Expose the Flask port
EXPOSE 5000

# Run the Flask app
CMD ["python", "app.py"]
