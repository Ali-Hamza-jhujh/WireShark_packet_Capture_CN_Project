from flask import Flask, jsonify, request
import LivePacketCapture 
import threading
import statistic 
import csv_file 
import os
from flask_cors import CORS

from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)
UPLOAD_FOLDER = "/backened/uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.route("/start", methods=["GET"])
def start():
    iface = request.args.get("iface")

    if not iface:
        return jsonify({"error": "Interface not provided"}), 400

    threading.Thread(
        target=LivePacketCapture.start_sniffing,
        args=(iface,),
        daemon=True
    ).start()

    return jsonify({"message": "Sniffing started"})


@app.route("/stop", methods=["GET"])
def stop():
    LivePacketCapture.stop_sniffing()
    return jsonify({"message": "Sniffing stopped"})


@app.route("/packets", methods=["GET"])
def get_packets():
    return jsonify(LivePacketCapture.get_packets())


@app.route("/upload_CSV", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"})

    file = request.files["file"]
    filename = secure_filename(file.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    file.save(filepath)

    packets = csv_file.read_CSV_file(filepath)
    return jsonify(packets)


@app.route("/statistics", methods=["GET"])
def statistics():
    return jsonify(statistic.Statistic_information())


@app.route("/interfaces", methods=["GET"])
def interfaces():
    return jsonify(LivePacketCapture.get_interfaces())


if __name__ == "__main__":
    app.run(debug=True)