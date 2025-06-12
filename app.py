from flask import Flask, render_template, request, jsonify, send_file, make_response # Import make_response
import numpy as np
import datetime
from pymongo import MongoClient
from bson.objectid import ObjectId
import pandas as pd  # Để xuất Excel và đọc Excel/CSV
import io  # Để làm việc với bộ nhớ đệm cho file
import base64 # Import for image decoding
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image # Import Image class
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader # Import ImageReader
from werkzeug.exceptions import HTTPException # Import HTTPException for error handling

app = Flask(__name__)

# Cấu hình kích thước file tải lên tối đa (ví dụ: 16 MB)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 Megabytes

# --- CẤU HÌNH MONGODB ---
MONGO_URI = "mongodb+srv://hieu:hieulo123@cluster0.dgkzdze.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "ahp_decision_support"
COLLECTION_NAME = "history_entries"

client = None
db = None
history_collection = None

try:
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    history_collection = db[COLLECTION_NAME]
    client.admin.command("ping")
    print("Successfully connected to MongoDB Atlas!")
except Exception as e:
    print(f"Error connecting to MongoDB Atlas: {e}")
# --- KẾT THÚC CẤU HÌNH MONGODB ---

# --- CẤU HÌNH FONT CHO PDF (QUAN TRỌNG CHO TIẾNG VIỆT) ---
try:
    pdfmetrics.registerFont(TTFont("DejaVuSans", "static/fonts/DejaVuSans.ttf"))
    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", "static/fonts/DejaVuSans-Bold.ttf"))
    print("PDF fonts registered successfully.")
except Exception as e:
    print(
        f"Warning: Could not register PDF fonts. Vietnamese characters might not display correctly: {e}"
    )
# --- KẾT THÚC CẤU HÌNH FONT ---


# Định nghĩa các tiêu chí và thương hiệu đã được bản địa hóa
CRITERIA = ["Nhu cầu", "Giá cả", "Chất lượng", "Tiết kiệm điện", "Thương hiệu", "An toàn", "Thiết kế"]
BRANDS = ["Samsung", "LG", "Panasonic", "Toshiba", "Aqua"]

# Chỉ số ngẫu nhiên RI (Random Index) cho các kích thước ma trận (từ tài liệu AHP của Saaty)
RI = {
    1: 0.00,
    2: 0.00,
    3: 0.58,
    4: 0.90,
    5: 1.12,
    6: 1.24,
    7: 1.32,
    8: 1.41,
    9: 1.45,
    10: 1.49,
    11: 1.51,
    12: 1.54,
    13: 1.56,
    14: 1.57,
    15: 1.59,
}


def calculate_ahp_core(matrix_data):
    """
    Hàm lõi để tính toán trọng số (eigenvector) và tỷ lệ nhất quán (CR)
    của một ma trận so sánh cặp.
    matrix_data: list of lists (dữ liệu ma trận từ JSON)
    """
    # NEW: Kiểm tra dữ liệu đầu vào từ frontend
    for r_idx, row in enumerate(matrix_data):
        for c_idx, val in enumerate(row):
            if not isinstance(val, (int, float)):
                raise ValueError(f"Dữ liệu không hợp lệ tại hàng {r_idx+1}, cột {c_idx+1}. Vui lòng nhập số.")
            if np.isnan(val) or np.isinf(val):
                raise ValueError(f"Dữ liệu không hợp lệ tại hàng {r_idx+1}, cột {c_idx+1}. Giá trị không phải là số hợp lệ.")
            if val <= 0: # Giá trị trong ma trận AHP phải là số dương
                raise ValueError(f"Dữ liệu không hợp lệ tại hàng {r_idx+1}, cột {c_idx+1}. Giá trị phải lớn hơn 0.")

    try:
        matrix = np.array(matrix_data, dtype=float)
    except ValueError:
        raise ValueError("Dữ liệu ma trận không hợp lệ. Đảm bảo tất cả là số.")

    n = matrix.shape[0]
    if n <= 1:  # Ma trận 1x1 hoặc rỗng
        # Trả về CI và Lambda_max cho trường hợp n <= 1
        return np.array([1.0]).tolist(), 0.0, 0.0, 0.0, True, [], [], []

    # Kiểm tra ma trận vuông và không có NaN/inf
    if matrix.shape[0] != matrix.shape[1]:
        raise ValueError("Ma trận phải là ma trận vuông.")
    if np.isnan(matrix).any() or np.isinf(matrix).any():
        raise ValueError("Ma trận chứa các giá trị không hợp lệ (NaN hoặc Inf).")

    # Kiểm tra tổng cột để tránh chia cho 0 trong bước chuẩn hóa
    col_sums = np.sum(matrix, axis=0)
    if np.any(col_sums == 0):
        raise ValueError("Tổng cột bằng 0. Dữ liệu ma trận không hợp lệ.")

    # Chuẩn hóa ma trận (chia từng phần tử cho tổng cột tương ứng)
    normalized_matrix = matrix / col_sums
    
    # Trọng số (eigenvector) - trung bình cộng các hàng của ma trận chuẩn hóa
    weights = np.mean(normalized_matrix, axis=1)
    weights = weights / np.sum(weights)  # Chuẩn hóa lại để tổng bằng 1

    # Tính Lambda Max (λ_max)
    weighted_sum_vector = np.dot(matrix, weights) # Tổng có trọng số của các hàng

    # Vector nhất quán (Consistency Vector)
    consistency_vector = np.array(
        [wsv / w if w > 1e-9 else 0 for wsv, w in zip(weighted_sum_vector, weights)]
    )

    lambda_max = np.mean(consistency_vector)

    # Tính chỉ số nhất quán CI
    CI = (lambda_max - n) / (n - 1) if (n - 1) > 0 else 0.0

    ri_value = RI.get(n, 1.60)  # Sử dụng 1.60 nếu n lớn hơn 15

    # Tính tỷ lệ nhất quán CR
    cr = CI / ri_value if ri_value > 1e-9 else 0.0

    # Tính tổng trọng số hàng của ma trận chuẩn hóa (Sum Weight)
    sum_weights_row = np.sum(normalized_matrix, axis=1).tolist()

    # Kiểm tra tính nhất quán (CR < 0.1)
    return (
        weights.tolist(), 
        float(cr), 
        float(CI), 
        float(lambda_max), 
        bool(cr < 0.1),
        normalized_matrix.tolist(), # Thêm normalized_matrix
        sum_weights_row,           # Thêm sum_weights_row
        consistency_vector.tolist() # Thêm consistency_vector
    )


@app.route("/")
def index():
    """
    Render trang chính của ứng dụng.
    Truyền danh sách tiêu chí và thương hiệu tới template.
    """
    return render_template("index.html", criteria=CRITERIA, brands=BRANDS)


# Endpoint để truyền biến cấu hình sang JavaScript
@app.route("/config.js")
def config_js():
    """
    Cung cấp các biến cấu hình (danh sách tiêu chí và thương hiệu)
    dưới dạng tệp JavaScript để frontend có thể sử dụng.
    """
    return app.response_class(
        f"const criteria_list = {jsonify(CRITERIA).data.decode('utf-8')};\n"
        f"const brands_list = {jsonify(BRANDS).data.decode('utf-8')};",
        mimetype="application/javascript",
    )


@app.route("/check_criteria_consistency", methods=["POST"])
def check_criteria_consistency():
    """
    Endpoint để kiểm tra tính nhất quán của ma trận tiêu chí.
    """
    data = request.json
    criteria_matrix_data = data.get("matrix")

    try:
        # Nhận thêm normalized_matrix, sum_weights_row, consistency_vector từ hàm calculate_ahp_core
        weights, cr, ci, lambda_max, consistent, normalized_matrix, sum_weights_row, consistency_vector = calculate_ahp_core(
            criteria_matrix_data
        )
        return jsonify(
            {
                "weights": weights,
                "cr": cr,
                "ci": ci,  # Thêm CI vào phản hồi
                "lambda_max": lambda_max,  # Thêm lambda_max vào phản hồi
                "consistent": consistent,
                "normalized_matrix": normalized_matrix, # Thêm normalized_matrix
                "sum_weights_row": sum_weights_row,   # Thêm sum_weights_row
                "consistency_vector": consistency_vector # Thêm consistency_vector
            }
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Lỗi server nội bộ: {str(e)}"}), 500


# NEW: Endpoint để kiểm tra tính nhất quán của ma trận thương hiệu
@app.route("/check_brand_consistency/<int:criterion_index>", methods=["POST"])
def check_brand_consistency(criterion_index):
    """
    Endpoint để kiểm tra tính nhất quán của ma trận thương hiệu cho một tiêu chí cụ thể.
    """
    data = request.json
    brand_matrix_data = data.get("matrix")

    if not (0 <= criterion_index < len(CRITERIA)):
        return jsonify({"error": "Chỉ số tiêu chí không hợp lệ."}), 400

    try:
        weights, cr, ci, lambda_max, consistent, normalized_matrix, sum_weights_row, consistency_vector = calculate_ahp_core(
            brand_matrix_data
        )
        return jsonify(
            {
                "weights": weights,
                "cr": cr,
                "ci": ci,
                "lambda_max": lambda_max,
                "consistent": consistent,
                "normalized_matrix": normalized_matrix,
                "sum_weights_row": sum_weights_row,
                "consistency_vector": consistency_vector,
                "criterion_index": criterion_index # Trả về index để frontend dễ xử lý
            }
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Lỗi server nội bộ: {str(e)}"}), 500


@app.route("/calculate", methods=["POST"])
def calculate():
    """
    Endpoint chính để tính toán tổng hợp điểm số thương hiệu
    dựa trên ma trận tiêu chí và ma trận thương hiệu con.
    Lưu kết quả vào MongoDB.
    """
    data = request.json
    criteria_matrix_data = data.get("criteria_matrix")
    brand_matrices_data = data.get("brand_matrices")

    try:
        # Tính toán trọng số của các tiêu chí
        # Cập nhật để nhận thêm CI và lambda_max (mặc dù không dùng trực tiếp ở đây, nhưng phù hợp với signature của hàm)
        (
            criteria_weights,
            criteria_cr,
            criteria_ci,
            criteria_lambda_max,
            criteria_consistent,
            criteria_normalized_matrix, # NEW
            criteria_sum_weights_row,   # NEW
            criteria_consistency_vector # NEW
        ) = calculate_ahp_core(criteria_matrix_data)

        # Kiểm tra tính nhất quán của ma trận tiêu chí trước khi tiếp tục
        if not criteria_consistent:
            return jsonify({"error": "Ma trận tiêu chí không nhất quán. Vui lòng điều chỉnh trước khi tính toán tổng hợp."}), 400

        brand_overall_scores = {brand: 0.0 for brand in BRANDS}
        brand_weights_per_criterion = {}

        for i, criterion_name in enumerate(CRITERIA):
            brand_matrix_for_criterion = brand_matrices_data.get(criterion_name)

            if not brand_matrix_for_criterion:
                # Nếu không có ma trận cho tiêu chí này, bỏ qua hoặc xử lý mặc định
                # Ví dụ: có thể gán trọng số đều nhau hoặc 0 tùy logic ứng dụng
                brand_weights_per_criterion[criterion_name] = {
                    "weights": [1/len(BRANDS)] * len(BRANDS), # Mặc định trọng số đều
                    "cr": 0.0,
                    "ci": 0.0,
                    "lambda_max": len(BRANDS),
                    "consistent": True,
                    "normalized_matrix": [],
                    "sum_weights_row": [],
                    "consistency_vector": []
                }
                continue

            # Cập nhật để nhận thêm CI và lambda_max
            (
                brand_weights_for_criterion,
                brand_cr,
                brand_ci,
                brand_lambda_max,
                brand_consistent,
                brand_normalized_matrix, # NEW
                brand_sum_weights_row,   # NEW
                brand_consistency_vector # NEW
            ) = calculate_ahp_core(brand_matrix_for_criterion)

            # Kiểm tra tính nhất quán của từng ma trận thương hiệu
            if not brand_consistent:
                return jsonify({"error": f"Ma trận thương hiệu cho tiêu chí '{criterion_name}' không nhất quán. Vui lòng điều chỉnh trước khi tính toán tổng hợp."}), 400


            brand_weights_per_criterion[criterion_name] = {
                "weights": brand_weights_for_criterion,
                "cr": brand_cr,
                "ci": brand_ci,
                "lambda_max": brand_lambda_max,
                "consistent": brand_consistent,
                "normalized_matrix": brand_normalized_matrix, # NEW
                "sum_weights_row": brand_sum_weights_row,   # NEW
                "consistency_vector": brand_consistency_vector # NEW
            }

            for j, brand_name in enumerate(BRANDS):
                brand_overall_scores[brand_name] += (
                    criteria_weights[i] * brand_weights_for_criterion[j]
                )

        final_brand_scores = sorted(
            brand_overall_scores.items(), key=lambda item: item[1], reverse=True
        )

        history_entry = {
            "timestamp": datetime.datetime.now(),
            "criteria_weights": criteria_weights,
            "criteria_cr": criteria_cr,
            "criteria_ci": criteria_ci,  # Lưu CI vào lịch sử
            "criteria_lambda_max": criteria_lambda_max,  # Lưu lambda_max vào lịch sử
            "criteria_consistent": criteria_consistent,
            "final_brand_scores": final_brand_scores,
            "best_brand": final_brand_scores[0][0] if final_brand_scores else "N/A",
            # Có thể lưu chi tiết từng ma trận thương hiệu vào lịch sử nếu cần,
            # nhưng sẽ làm dữ liệu lớn hơn. Tạm thời không lưu chi tiết này vào lịch sử.
            # "brand_weights_per_criterion_details": brand_weights_per_criterion
        }

        if history_collection is not None:
            try:
                history_collection.insert_one(history_entry)
                print("History entry saved to MongoDB Atlas.")
            except Exception as e:
                print(f"Error saving to MongoDB Atlas: {e}")
        else:
            print("MongoDB connection not established, skipping saving history.")

        return jsonify(
            {
                "criteria_weights": criteria_weights,
                "criteria_cr": criteria_cr,
                "criteria_ci": criteria_ci,
                "criteria_lambda_max": criteria_lambda_max,
                "criteria_consistent": criteria_consistent,
                "brand_weights_per_criterion": brand_weights_per_criterion, # Đã bao gồm chi tiết
                "final_brand_scores": final_brand_scores,
            }
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Lỗi server nội bộ: {str(e)}"}), 500


# Endpoint để lấy lịch sử từ MongoDB với phân trang
@app.route("/history")
def get_history():
    """
    Lấy danh sách lịch sử tính toán từ MongoDB với hỗ trợ phân trang.
    """
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 5, type=int)

    history = []
    total_items = 0

    if history_collection is not None:
        try:
            total_items = history_collection.count_documents({})
            skip = (page - 1) * limit

            for entry in (
                history_collection.find().sort("timestamp", -1).skip(skip).limit(limit)
            ):
                entry["_id"] = str(entry["_id"])
                entry["timestamp"] = entry["timestamp"].strftime("%Y-%m-%d %H:%M:%S")
                history.append(entry)
        except Exception as e:
            print(f"Error fetching history from MongoDB Atlas: {e}")
            return (
                jsonify(
                    {
                        "history": [],
                        "total_items": 0,
                        "error": "Không thể tải lịch sử từ MongoDB.",
                    }
                ),
                500,
            )
    else:
        print("MongoDB connection not established, cannot fetch history.")
        return (
            jsonify(
                {
                    "history": [],
                    "total_items": 0,
                    "error": "Kết nối MongoDB không được thiết lập.",
                }
            ),
            500,
        )

    return jsonify({"history": history, "total_items": total_items, "page": page, "limit": limit})


# Endpoint để xóa lịch sử từ MongoDB
@app.route("/clear_history", methods=["POST"])
def clear_history():
    """
    Xóa toàn bộ lịch sử tính toán từ MongoDB.
    """
    if history_collection is not None:
        try:
            history_collection.delete_many({})
            print("History cleared from MongoDB Atlas.")
            return jsonify({"message": "Lịch sử đã được xóa khỏi MongoDB Atlas."})
        except Exception as e:
            print(f"Error clearing history from MongoDB Atlas: {e}")
            return (
                jsonify({"message": "Đã xảy ra lỗi khi xóa lịch sử từ MongoDB Atlas."}),
                500,
            )
    return (
        jsonify({"message": "Kết nối MongoDB không được thiết lập, không thể xóa lịch sử."}),
        500,
    )


# Endpoint để xuất lịch sử ra file Excel (Giữ nguyên cho việc xuất toàn bộ lịch sử)
@app.route("/export_excel")
def export_excel():
    """
    Xuất tất cả lịch sử tính toán ra file Excel.
    """
    if history_collection is None:
        return jsonify({"error": "Kết nối MongoDB không được thiết lập."}), 500

    try:
        all_history_entries = list(history_collection.find().sort("timestamp", -1))
        
        if not all_history_entries:
            return jsonify({"error": "Không có dữ liệu lịch sử để xuất."}), 404

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            workbook = writer.book
            sheet = workbook.add_worksheet('Lịch sử AHP')

            # Define formats
            bold_format = workbook.add_format({'bold': True})
            center_bold_format = workbook.add_format({'bold': True, 'align': 'center'})
            
            row_offset = 0 # Keep track of current row for writing

            for i, entry in enumerate(all_history_entries):
                # Section Title for each history entry
                sheet.merge_range(row_offset, 0, row_offset, 3, f"Kết quả lần {i + 1} - Thời gian: {entry.get('timestamp', 'N/A').strftime('%Y-%m-%d %H:%M:%S')}", center_bold_format)
                row_offset += 2 # Move to next section, leave a blank row

                # General Info
                sheet.write(row_offset, 0, "Thương hiệu tốt nhất:", bold_format)
                sheet.write(row_offset, 1, entry.get('best_brand', 'N/A'))
                row_offset += 1
                sheet.write(row_offset, 0, "Tỷ lệ nhất quán tiêu chí (CR):", bold_format)
                sheet.write(row_offset, 1, f"{entry.get('criteria_cr', 0.0):.4f} ({'Nhất quán' if entry.get('criteria_consistent', False) else 'Không nhất quán'})")
                row_offset += 1
                sheet.write(row_offset, 0, "Chỉ số nhất quán (CI):", bold_format)
                sheet.write(row_offset, 1, f"{entry.get('criteria_ci', 0.0):.4f}")
                row_offset += 1
                sheet.write(row_offset, 0, "Lambda Max (λ_max):", bold_format)
                sheet.write(row_offset, 1, f"{entry.get('criteria_lambda_max', 0.0):.4f}")
                row_offset += 2 # Spacer

                # Criteria Weights Table
                sheet.write(row_offset, 0, "Trọng số các tiêu chí:", bold_format)
                row_offset += 1
                sheet.write(row_offset, 0, "Tiêu chí", bold_format)
                sheet.write(row_offset, 1, "Trọng số", bold_format)
                
                # Store criteria data for autofit
                criteria_data_for_autofit = [["Tiêu chí", "Trọng số"]]
                if 'criteria_weights' in entry and isinstance(entry['criteria_weights'], list):
                    for j, weight in enumerate(entry['criteria_weights']):
                        row_offset += 1
                        criterion_label = CRITERIA[j] if j < len(CRITERIA) else f"Tiêu chí không xác định {j}"
                        weight_str = f"{(weight * 100):.2f}%"
                        sheet.write(row_offset, 0, criterion_label)
                        sheet.write(row_offset, 1, weight_str)
                        criteria_data_for_autofit.append([criterion_label, weight_str])
                
                # Autofit columns for criteria section
                for col_idx in range(2):
                    max_len = 0
                    for r_data in criteria_data_for_autofit:
                        if col_idx < len(r_data):
                            max_len = max(max_len, len(str(r_data[col_idx])))
                    sheet.set_column(col_idx, col_idx, max_len + 2) # Add some padding

                row_offset += 2 # Spacer

                # Brand Scores Table
                sheet.write(row_offset, 0, "Điểm số tổng hợp các thương hiệu:", bold_format)
                row_offset += 1
                sheet.write(row_offset, 0, "Thương hiệu", bold_format)
                sheet.write(row_offset, 1, "Điểm số", bold_format)

                # Store brand scores data for autofit
                brand_scores_data_for_autofit = [["Thương hiệu", "Điểm số"]]
                if 'final_brand_scores' in entry and isinstance(entry['final_brand_scores'], list):
                    for bs in entry['final_brand_scores']:
                        row_offset += 1
                        if isinstance(bs, list) and len(bs) == 2:
                            score_str = f"{bs[1]:.4f}"
                            sheet.write(row_offset, 0, bs[0])
                            sheet.write(row_offset, 1, score_str)
                            brand_scores_data_for_autofit.append([bs[0], score_str])
                
                # Autofit columns for brand scores section
                for col_idx in range(2):
                    max_len = 0
                    for r_data in brand_scores_data_for_autofit:
                        if col_idx < len(r_data):
                            max_len = max(max_len, len(str(r_data[col_idx])))
                    sheet.set_column(col_idx, col_idx, max_len + 2) # Add some padding

                row_offset += 3 # Larger spacer between history entries

        output.seek(0) 

        response = make_response(output.getvalue())
        response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        response.headers['Content-Disposition'] = 'attachment; filename=lich_su_ahp.xlsx'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except Exception as e:
        print(f"Error exporting to Excel: {e}")
        # Trả về JSON lỗi thay vì HTML
        return jsonify({"error": f"Đã xảy ra lỗi khi xuất file Excel: {str(e)}"}), 500


# Endpoint để xuất lịch sử ra file PDF (Giữ nguyên cho việc xuất toàn bộ lịch sử)
@app.route("/export_pdf")
def export_pdf():
    """
    Xuất tất cả lịch sử tính toán ra file PDF.
    """
    if history_collection is None:
        return jsonify({"error": "Kết nối MongoDB không được thiết lập."}), 500

    try:
        all_history_entries = list(history_collection.find().sort("timestamp", -1))
        
        if not all_history_entries:
            return jsonify({"error": "Không có dữ liệu lịch sử để xuất."}), 404

        output = io.BytesIO()
        doc = SimpleDocTemplate(output, pagesize=A4,
                                 leftMargin=50, rightMargin=50,
                                 topMargin=50, bottomMargin=50)

        styles = getSampleStyleSheet()

        styles.add(ParagraphStyle(name='VietnameseNormal', fontName='DejaVuSans', fontSize=10, leading=12, alignment=TA_LEFT))
        styles.add(ParagraphStyle(name='VietnameseHeading1', fontName='DejaVuSans-Bold', fontSize=16, leading=18, alignment=TA_CENTER, spaceAfter=8))
        styles.add(ParagraphStyle(name='VietnameseHeading2', fontName='DejaVuSans-Bold', fontSize=12, leading=14, alignment=TA_LEFT, spaceBefore=4, spaceAfter=4))
        
        elements = []

        elements.append(Paragraph("Báo Cáo Lịch Sử Tính Toán AHP", styles['VietnameseHeading1']))
        elements.append(Spacer(1, 0.1 * inch))

        for i, entry in enumerate(all_history_entries):
            elements.append(Paragraph(f"<b>Kết quả lần {i + 1} - Thời gian: {entry.get('timestamp', 'N/A').strftime('%Y-%m-%d %H:%M:%S')}</b>", styles['VietnameseHeading2']))
            elements.append(Paragraph(f"Thương hiệu tốt nhất: <b>{entry.get('best_brand', 'N/A')}</b>", styles['VietnameseNormal']))
            elements.append(Paragraph(f"Tỷ lệ nhất quán tiêu chí (CR): {entry.get('criteria_cr', 0.0):.4f} ({'Nhất quán' if entry.get('criteria_consistent', False) else 'Không nhất quán'})", styles['VietnameseNormal']))
            elements.append(Paragraph(f"Chỉ số nhất quán (CI): {entry.get('criteria_ci', 0.0):.4f}", styles['VietnameseNormal'])) # Thêm vào PDF
            elements.append(Paragraph(f"Lambda Max ($\lambda_{max}$): {entry.get('criteria_lambda_max', 0.0):.4f}", styles['VietnameseNormal'])) # Thêm vào PDF
            elements.append(Spacer(1, 0.05 * inch))

            if 'criteria_weights' in entry and isinstance(entry['criteria_weights'], list):
                elements.append(Paragraph("Trọng số các tiêu chí:", styles['VietnameseHeading2']))
                criteria_data = [["Tiêu chí", "Trọng số"]]
                for j, weight in enumerate(entry['criteria_weights']):
                    if j < len(CRITERIA):
                        criteria_data.append([CRITERIA[j], f"{weight*100:.2f}%"])
                    else:
                        criteria_data.append([f"Tiêu chí không xác định {j}", f"{weight*100:.2f}%"])
                
                table_criteria = Table(criteria_data, colWidths=[doc.width/2.0, doc.width/2.0])
                table_criteria.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'DejaVuSans-Bold'),
                    ('FONTNAME', (0, 1), (-1, -1), 'DejaVuSans'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))
                elements.append(table_criteria)
                elements.append(Spacer(1, 0.05 * inch))

            if 'final_brand_scores' in entry and isinstance(entry['final_brand_scores'], list):
                elements.append(Paragraph("Điểm số tổng hợp các thương hiệu:", styles['VietnameseHeading2']))
                brand_score_data = [["Thương hiệu", "Điểm số"]]
                for bs in entry['final_brand_scores']:
                    if isinstance(bs, list) and len(bs) == 2:
                        brand_score_data.append([bs[0], f"{bs[1]:.4f}"])
                
                table_brands = Table(brand_score_data, colWidths=[doc.width/2.0, doc.width/2.0])
                table_brands.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'DejaVuSans-Bold'),
                    ('FONTNAME', (0, 1), (-1, -1), 'DejaVuSans'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.lightgreen),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))
                elements.append(table_brands)
            
            if i < len(all_history_entries) - 1:
                elements.append(Spacer(1, 0.1 * inch))
                line_table = Table([['']], colWidths=[doc.width])
                line_table.setStyle(TableStyle([
                    ('LINEBELOW', (0,0), (-1,-1), 1, colors.black),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 0)
                ]))
                elements.append(line_table)
                elements.append(Spacer(1, 0.1 * inch))

        doc.build(elements)
        output.seek(0)

        response = make_response(output.getvalue())
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = 'attachment; filename=lich_su_ahp.pdf'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except Exception as e:
        print(f"Error exporting to PDF: {e}")
        return jsonify({"error": f"Đã xảy ra lỗi khi xuất file PDF: {str(e)}"}), 500


# NEW: Endpoint để xuất kết quả hiện tại ra file Excel
@app.route("/export_current_excel", methods=["POST"])
def export_current_excel():
    """
    Xuất kết quả tính toán hiện tại ra file Excel.
    Bao gồm ma trận tiêu chí và các ma trận thương hiệu thô.
    """
    data = request.json
    criteria_weights = data.get('criteria_weights', [])
    criteria_cr = data.get('criteria_cr', 0.0)
    criteria_ci = data.get('criteria_ci', 0.0)
    criteria_lambda_max = data.get('criteria_lambda_max', 0.0)
    criteria_consistent = data.get('criteria_consistent', False)
    final_brand_scores = data.get('final_brand_scores', [])
    best_brand = data.get('best_brand', 'N/A')
    criteria_labels = data.get('criteria_labels', [])
    brand_labels = data.get('brand_labels', [])
    brand_weights_per_criterion = data.get('brand_weights_per_criterion', {})

    # NEW: Get raw matrices
    criteria_matrix_raw = data.get('criteria_matrix_raw', [])
    brand_matrices_raw = data.get('brand_matrices_raw', {})

    if not criteria_weights or not final_brand_scores:
        return jsonify({"error": "Không có dữ liệu kết quả để xuất."}), 400

    output = io.BytesIO()
    try:
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            workbook = writer.book

            # Define formats
            bold_format = workbook.add_format({'bold': True})
            center_bold_format = workbook.add_format({'bold': True, 'align': 'center'})
            header_format = workbook.add_format({'bold': True, 'bg_color': '#DDEBF7', 'border': 1, 'align': 'center', 'valign': 'vcenter'}) # Light blue header
            cell_format = workbook.add_format({'border': 1, 'align': 'center', 'valign': 'vcenter'})
            
            row_offset = 0 # Keep track of current row for writing

            # --- Main Report Title ---
            sheet_main = workbook.add_worksheet('Báo cáo AHP')
            sheet_main.merge_range(row_offset, 0, row_offset, 5, "BÁO CÁO KẾT QUẢ TÍNH TOÁN AHP HIỆN TẠI", center_bold_format)
            row_offset += 2

            # --- General Info ---
            sheet_main.write(row_offset, 0, "Thời gian xuất báo cáo:", bold_format)
            sheet_main.write(row_offset, 1, datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            row_offset += 1
            sheet_main.write(row_offset, 0, "Thương hiệu tốt nhất được khuyến nghị:", bold_format)
            sheet_main.write(row_offset, 1, best_brand)
            row_offset += 1
            sheet_main.write(row_offset, 0, "Tỷ lệ nhất quán tiêu chí (CR):", bold_format)
            sheet_main.write(row_offset, 1, f"{criteria_cr:.4f} ({'Nhất quán' if criteria_consistent else 'Không nhất quán'})")
            row_offset += 1
            sheet_main.write(row_offset, 0, "Chỉ số nhất quán (CI):", bold_format)
            sheet_main.write(row_offset, 1, f"{criteria_ci:.4f}")
            row_offset += 1
            sheet_main.write(row_offset, 0, "Lambda Max (λ_max):", bold_format)
            sheet_main.write(row_offset, 1, f"{criteria_lambda_max:.4f}")
            row_offset += 2

            # --- Criteria Weights Table ---
            sheet_main.write(row_offset, 0, "Trọng số các tiêu chí:", bold_format)
            row_offset += 1
            sheet_main.write(row_offset, 0, "Tiêu chí", header_format)
            sheet_main.write(row_offset, 1, "Trọng số", header_format)
            
            criteria_data_for_autofit = [["Tiêu chí", "Trọng số"]]
            for i, weight in enumerate(criteria_weights):
                row_offset += 1
                criterion_label = criteria_labels[i] if i < len(criteria_labels) else f"Tiêu chí không xác định {i}"
                weight_str = f"{(weight * 100):.2f}%"
                sheet_main.write(row_offset, 0, criterion_label, cell_format)
                sheet_main.write(row_offset, 1, weight_str, cell_format)
                criteria_data_for_autofit.append([criterion_label, weight_str])
            row_offset += 2

            # --- Brand Scores Table ---
            sheet_main.write(row_offset, 0, "Điểm số tổng hợp các thương hiệu:", bold_format)
            row_offset += 1
            sheet_main.write(row_offset, 0, "Thương hiệu", header_format)
            sheet_main.write(row_offset, 1, "Điểm số", header_format)

            brand_scores_data_for_autofit = [["Thương hiệu", "Điểm số"]]
            for bs in final_brand_scores:
                row_offset += 1
                if isinstance(bs, list) and len(bs) == 2:
                    score_str = f"{bs[1]:.4f}"
                    sheet_main.write(row_offset, 0, bs[0], cell_format)
                    sheet_main.write(row_offset, 1, score_str, cell_format)
                    brand_scores_data_for_autofit.append([bs[0], score_str])
            row_offset += 2

            # --- Consolidated Brand Weights per Criterion Table ---
            sheet_main.write(row_offset, 0, "Tổng hợp trọng số thương hiệu theo từng tiêu chí:", bold_format)
            row_offset += 1
            
            consolidated_headers = ["Thương hiệu"] + criteria_labels
            sheet_main.write_row(row_offset, 0, consolidated_headers, header_format)
            row_offset += 1

            consolidated_data_for_autofit = [consolidated_headers]
            for brand_index, brand_name in enumerate(brand_labels):
                row_values = [brand_name]
                for criterion_name in criteria_labels:
                    criterion_data = brand_weights_per_criterion.get(criterion_name)
                    if criterion_data and criterion_data.get('weights') and len(criterion_data['weights']) > brand_index:
                        weight = criterion_data['weights'][brand_index]
                        row_values.append(f"{(weight * 100):.2f}%")
                    else:
                        row_values.append("-") 
                sheet_main.write_row(row_offset, 0, row_values, cell_format)
                consolidated_data_for_autofit.append(row_values)
                row_offset += 1
            row_offset += 2

            # Autofit columns for the main sheet
            all_data_for_autofit = criteria_data_for_autofit + brand_scores_data_for_autofit + consolidated_data_for_autofit
            for col_idx in range(len(consolidated_headers)): # Use max possible columns
                max_len = 0
                for r_data in all_data_for_autofit:
                    if col_idx < len(r_data):
                        max_len = max(max_len, len(str(r_data[col_idx])))
                sheet_main.set_column(col_idx, col_idx, max_len + 2) # Add some padding

            # --- Raw Criteria Comparison Matrix ---
            if criteria_matrix_raw:
                sheet_main.write(row_offset, 0, "Ma trận so sánh cặp Tiêu chí:", bold_format)
                row_offset += 1

                criteria_matrix_headers = ["Tiêu chí"] + criteria_labels
                sheet_main.write_row(row_offset, 0, criteria_matrix_headers, header_format)
                row_offset += 1

                for r_idx, row_data in enumerate(criteria_matrix_raw):
                    row_to_write = [criteria_labels[r_idx]] + [f"{val:.2f}" for val in row_data]
                    sheet_main.write_row(row_offset, 0, row_to_write, cell_format)
                    row_offset += 1
                row_offset += 2 # Spacer

            # --- Raw Brand Comparison Matrices per Criterion ---
            if brand_matrices_raw:
                sheet_main.write(row_offset, 0, "Ma trận so sánh cặp Thương hiệu theo Tiêu chí:", bold_format)
                row_offset += 1

                for crit_idx, criterion_name in enumerate(criteria_labels):
                    matrix = brand_matrices_raw.get(criterion_name)
                    if matrix:
                        sheet_main.write(row_offset, 0, f"Tiêu chí: {criterion_name}", bold_format)
                        row_offset += 1

                        brand_matrix_headers = ["Thương hiệu"] + brand_labels
                        sheet_main.write_row(row_offset, 0, brand_matrix_headers, header_format)
                        row_offset += 1

                        for r_idx, row_data in enumerate(matrix):
                            row_to_write = [brand_labels[r_idx]] + [f"{val:.2f}" for val in row_data]
                            sheet_main.write_row(row_offset, 0, row_to_write, cell_format)
                            row_offset += 1
                        row_offset += 2 # Spacer between brand matrices

        output.seek(0) 

        excel_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
        
        return jsonify({
            "file_content": excel_base64,
            "file_name": "ket_qua_ahp.xlsx",
            "message": "File Excel đã được tạo thành công."
        })
    except Exception as e:
        print(f"Error exporting to Excel: {e}")
        return jsonify({"error": f"Đã xảy ra lỗi khi xuất file Excel: {str(e)}"}), 500

# NEW: Endpoint để xuất kết quả hiện tại ra file PDF
@app.route("/export_current_pdf", methods=["POST"])
def export_current_pdf():
    """
    Xuất kết quả tính toán hiện tại ra file PDF.
    Bao gồm ma trận tiêu chí và các ma trận thương hiệu thô.
    """
    data = request.json
    criteria_weights = data.get('criteria_weights', [])
    criteria_cr = data.get('criteria_cr', 0.0)
    criteria_ci = data.get('criteria_ci', 0.0)
    criteria_lambda_max = data.get('criteria_lambda_max', 0.0)
    criteria_consistent = data.get('criteria_consistent', False)
    final_brand_scores = data.get('final_brand_scores', [])
    best_brand = data.get('best_brand', 'N/A')
    criteria_labels = data.get('criteria_labels', [])
    brand_labels = data.get('brand_labels', [])
    brand_weights_per_criterion = data.get('brand_weights_per_criterion', {}) 

    # NEW: Get raw matrices
    criteria_matrix_raw = data.get('criteria_matrix_raw', [])
    brand_matrices_raw = data.get('brand_matrices_raw', {})

    # Get chart images from request data
    criteria_pie_chart_image_b64 = data.get('criteria_pie_chart_image', None)
    brands_bar_chart_image_b64 = data.get('brands_bar_chart_image', None)

    # NEW: Get chart dimensions
    criteria_pie_chart_image_width = data.get('criteria_pie_chart_image_width', 400) 
    criteria_pie_chart_image_height = data.get('criteria_pie_chart_image_height', 250) 
    brands_bar_chart_image_width = data.get('brands_bar_chart_image_width', 400) 
    brands_bar_chart_image_height = data.get('brands_bar_chart_image_height', 250) 

    # Scaling factor for charts
    chart_scale_factor = 0.3 # Adjust this value to make charts smaller or larger

    if not criteria_weights or not final_brand_scores:
        return jsonify({"error": "Không có dữ liệu kết quả để xuất."}), 400

    output = io.BytesIO()
    try: 
        doc = SimpleDocTemplate(output, pagesize=A4,
                                 leftMargin=50, rightMargin=50,
                                 topMargin=50, bottomMargin=50)

        styles = getSampleStyleSheet()

        styles.add(ParagraphStyle(name='VietnameseNormal', fontName='DejaVuSans', fontSize=10, leading=12, alignment=TA_LEFT))
        styles.add(ParagraphStyle(name='VietnameseNormalCenter', fontName='DejaVuSans', fontSize=10, leading=12, alignment=TA_CENTER))
        styles.add(ParagraphStyle(name='VietnameseHeading1', fontName='DejaVuSans-Bold', fontSize=16, leading=18, alignment=TA_CENTER, spaceAfter=8))
        styles.add(ParagraphStyle(name='VietnameseHeading2', fontName='DejaVuSans-Bold', fontSize=12, leading=14, alignment=TA_LEFT, spaceBefore=4, spaceAfter=4))
        styles.add(ParagraphStyle(name='VietnameseHeading2Center', fontName='DejaVuSans-Bold', fontSize=12, leading=14, alignment=TA_CENTER, spaceBefore=4, spaceAfter=4))
        styles.add(ParagraphStyle(name='VietnameseTableContent', fontName='DejaVuSans', fontSize=9, leading=10, alignment=TA_CENTER))
        styles.add(ParagraphStyle(name='VietnameseTableHeader', fontName='DejaVuSans-Bold', fontSize=9, leading=10, alignment=TA_CENTER))

        elements = []

        elements.append(Paragraph("Báo Cáo Kết Quả Tính Toán AHP Hiện Tại", styles['VietnameseHeading1']))
        elements.append(Spacer(1, 0.1 * inch))

        elements.append(Paragraph(f"<b>Thời gian xuất báo cáo: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</b>", styles['VietnameseNormal']))
        elements.append(Paragraph(f"Thương hiệu tốt nhất được khuyến nghị: <b>{best_brand}</b>", styles['VietnameseNormal']))
        elements.append(Paragraph(f"Tỷ lệ nhất quán tiêu chí (CR): {criteria_cr:.4f} ({'Nhất quán' if criteria_consistent else 'Không nhất quán'})", styles['VietnameseNormal']))
        elements.append(Paragraph(f"Chỉ số nhất quán (CI): {criteria_ci:.4f}", styles['VietnameseNormal']))
        elements.append(Paragraph(f"Lambda Max ($\lambda_{max}$): {criteria_lambda_max:.4f}", styles['VietnameseNormal']))
        elements.append(Spacer(1, 0.05 * inch))

        if criteria_weights:
            elements.append(Paragraph("Trọng số các tiêu chí:", styles['VietnameseHeading2']))
            criteria_data = [
                [Paragraph("Tiêu chí", styles['VietnameseTableHeader']), Paragraph("Trọng số", styles['VietnameseTableHeader'])]
            ]
            for j, weight in enumerate(criteria_weights):
                if j < len(criteria_labels):
                    criteria_data.append([
                        Paragraph(criteria_labels[j], styles['VietnameseTableContent']), 
                        Paragraph(f"{weight*100:.2f}%", styles['VietnameseTableContent'])
                    ])
                else:
                    criteria_data.append([
                        Paragraph(f"Tiêu chí không xác định {j}", styles['VietnameseTableContent']), 
                        Paragraph(f"{weight*100:.2f}%", styles['VietnameseTableContent'])
                    ])
            
            table_criteria = Table(criteria_data, colWidths=[doc.width/2.0, doc.width/2.0])
            table_criteria.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DDEBF7')), # Light blue header
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'DejaVuSans-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'DejaVuSans'),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(table_criteria)
            elements.append(Spacer(1, 0.05 * inch))

        # Add Criteria Pie Chart if available
        if criteria_pie_chart_image_b64:
            try:
                # Remove the "data:image/png;base64," prefix
                img_data = base64.b64decode(criteria_pie_chart_image_b64.split(',')[1])
                # Use actual dimensions for image creation, scaled down
                img = Image(io.BytesIO(img_data), 
                            width=criteria_pie_chart_image_width * chart_scale_factor, 
                            height=criteria_pie_chart_image_height * chart_scale_factor) 
                img.hAlign = 'CENTER'
                elements.append(Spacer(1, 0.1 * inch))
                elements.append(Paragraph("Biểu đồ Trọng số các Tiêu chí:", styles['VietnameseHeading2']))
                elements.append(img)
                elements.append(Spacer(1, 0.1 * inch))
            except Exception as e:
                print(f"Error embedding criteria pie chart: {e}")
                elements.append(Paragraph(f"<i>(Không thể tải biểu đồ tròn tiêu chí: {e})</i>", styles['VietnameseNormal']))


        if final_brand_scores:
            elements.append(Paragraph("Điểm số tổng hợp các thương hiệu:", styles['VietnameseHeading2']))
            brand_score_data = [
                [Paragraph("Thương hiệu", styles['VietnameseTableHeader']), Paragraph("Điểm số", styles['VietnameseTableHeader'])]
            ]
            for bs in final_brand_scores:
                if isinstance(bs, list) and len(bs) == 2:
                    brand_score_data.append([
                        Paragraph(bs[0], styles['VietnameseTableContent']), 
                        Paragraph(f"{bs[1]:.4f}", styles['VietnameseTableContent'])
                    ])
                
            table_brands = Table(brand_score_data, colWidths=[doc.width/2.0, doc.width/2.0])
            table_brands.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DDEBF7')), # Light blue header
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'DejaVuSans-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'DejaVuSans'),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(table_brands)
            elements.append(Spacer(1, 0.05 * inch))

        # Add Brands Bar Chart if available
        if brands_bar_chart_image_b64:
            try:
                # Remove the "data:image/png;base64," prefix
                img_data = base64.b64decode(brands_bar_chart_image_b64.split(',')[1])
                # Use actual dimensions for image creation, scaled down
                img = Image(io.BytesIO(img_data), 
                            width=brands_bar_chart_image_width * chart_scale_factor, 
                            height=brands_bar_chart_image_height * chart_scale_factor) 
                img.hAlign = 'CENTER'
                elements.append(Spacer(1, 0.1 * inch))
                elements.append(Paragraph("Biểu đồ Điểm số tổng hợp các thương hiệu:", styles['VietnameseHeading2']))
                elements.append(img)
                elements.append(Spacer(1, 0.1 * inch))
            except Exception as e:
                print(f"Error embedding brands bar chart: {e}")
                elements.append(Paragraph(f"<i>(Không thể tải biểu đồ cột thương hiệu: {e})</i>", styles['VietnameseNormal']))
        
        # NEW: Add Consolidated Brand Weights per Criterion Table
        if brand_weights_per_criterion and criteria_labels and brand_labels:
            elements.append(Paragraph("Tổng hợp trọng số thương hiệu theo từng tiêu chí:", styles['VietnameseHeading2']))
            
            # Prepare table headers
            consolidated_table_headers = [Paragraph("Thương hiệu", styles['VietnameseTableHeader'])] + [Paragraph(label, styles['VietnameseTableHeader']) for label in criteria_labels]
            
            # Prepare table data
            consolidated_table_data = [consolidated_table_headers]
            for brand_name in brand_labels:
                row_values = [Paragraph(brand_name, styles['VietnameseTableContent'])]
                for criterion_name in criteria_labels:
                    criterion_data = brand_weights_per_criterion.get(criterion_name)
                    if criterion_data and criterion_data.get('weights') and brand_name in BRANDS:
                        brand_index = BRANDS.index(brand_name)
                        if len(criterion_data['weights']) > brand_index:
                            weight = criterion_data['weights'][brand_index]
                            row_values.append(Paragraph(f"{(weight * 100):.2f}%", styles['VietnameseTableContent']))
                        else:
                            row_values.append(Paragraph("-", styles['VietnameseTableContent'])) # Fallback if brand index is out of bounds
                    else:
                        row_values.append(Paragraph("-", styles['VietnameseTableContent'])) # Fallback if criterion data is missing
                consolidated_table_data.append(row_values)
            
            num_cols = len(consolidated_table_headers)
            col_widths = [doc.width * 0.2] + [doc.width * 0.8 / (num_cols - 1)] * (num_cols - 1) if num_cols > 1 else [doc.width]

            table_consolidated = Table(consolidated_table_data, colWidths=col_widths)
            table_consolidated.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DDEBF7')), # Light blue header
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'DejaVuSans-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'DejaVuSans'),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(table_consolidated)
            elements.append(Spacer(1, 0.1 * inch))

        # --- NEW: Raw Criteria Comparison Matrix in PDF ---
        if criteria_matrix_raw:
            elements.append(Paragraph("Ma trận so sánh cặp Tiêu chí:", styles['VietnameseHeading2']))
            
            criteria_matrix_pdf_data = [[Paragraph(label, styles['VietnameseTableHeader']) for label in ["Tiêu chí"] + criteria_labels]]
            for r_idx, row_data in enumerate(criteria_matrix_raw):
                row_for_pdf = [Paragraph(criteria_labels[r_idx], styles['VietnameseTableContent'])] + [Paragraph(f"{val:.2f}", styles['VietnameseTableContent']) for val in row_data]
                criteria_matrix_pdf_data.append(row_for_pdf)
            
            # Calculate column widths dynamically for criteria matrix
            num_cols_criteria = len(criteria_labels) + 1
            col_widths_criteria = [doc.width * 0.2] + [doc.width * 0.8 / len(criteria_labels)] * len(criteria_labels)

            table_criteria_raw = Table(criteria_matrix_pdf_data, colWidths=col_widths_criteria)
            table_criteria_raw.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FCE4D6')), # Light orange header
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'DejaVuSans-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'DejaVuSans'),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(table_criteria_raw)
            elements.append(Spacer(1, 0.1 * inch))

        # --- NEW: Raw Brand Comparison Matrices per Criterion in PDF ---
        if brand_matrices_raw:
            elements.append(Paragraph("Ma trận so sánh cặp Thương hiệu theo Tiêu chí:", styles['VietnameseHeading2']))
            
            for crit_idx, criterion_name in enumerate(criteria_labels):
                matrix = brand_matrices_raw.get(criterion_name)
                if matrix:
                    elements.append(Paragraph(f"<b>Tiêu chí: {criterion_name}</b>", styles['VietnameseNormal']))
                    
                    brand_matrix_pdf_data = [[Paragraph(label, styles['VietnameseTableHeader']) for label in ["Thương hiệu"] + brand_labels]]
                    for r_idx, row_data in enumerate(matrix):
                        row_for_pdf = [Paragraph(brand_labels[r_idx], styles['VietnameseTableContent'])] + [Paragraph(f"{val:.2f}", styles['VietnameseTableContent']) for val in row_data]
                        brand_matrix_pdf_data.append(row_for_pdf)
                    
                    # Calculate column widths dynamically for brand matrices
                    num_cols_brand = len(brand_labels) + 1
                    col_widths_brand = [doc.width * 0.2] + [doc.width * 0.8 / len(brand_labels)] * len(brand_labels)

                    table_brand_raw = Table(brand_matrix_pdf_data, colWidths=col_widths_brand)
                    table_brand_raw.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FFF2CC')), # Light yellow header
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('FONTNAME', (0, 0), (-1, 0), 'DejaVuSans-Bold'),
                        ('FONTNAME', (0, 1), (-1, -1), 'DejaVuSans'),
                        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                        ('GRID', (0, 0), (-1, -1), 1, colors.black)
                    ]))
                    elements.append(table_brand_raw)
                    elements.append(Spacer(1, 0.1 * inch))


        doc.build(elements)
        output.seek(0)

        response = make_response(output.getvalue())
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = 'attachment; filename=ket_qua_ahp.pdf'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate' 
        response.headers['Pragma'] = 'no-cache' 
        response.headers['Expires'] = '0' 
        return response
    except Exception as e:
        print(f"Error exporting to PDF: {e}")
        return jsonify({"error": f"Đã xảy ra lỗi khi xuất file PDF: {str(e)}"}), 500

# NEW: Error handler for 404 Not Found
@app.errorhandler(404)
def not_found_error(error):
    """
    Custom 404 error handler to return JSON response instead of HTML.
    """
    return jsonify({"error": "Đường dẫn không tồn tại trên server."}), 404

# NEW: General exception handler to return JSON for all unhandled exceptions
@app.errorhandler(Exception)
def handle_exception(e):
    # Pass through HTTP errors
    if isinstance(e, HTTPException):
        return e

    # Handle other non-HTTP exceptions
    app.logger.error('Unhandled Exception: %s', (e), exc_info=True)
    return jsonify({"error": "Lỗi server nội bộ không xác định: " + str(e)}), 500

# NEW: Endpoint để nhập ma trận tiêu chí từ file Excel/CSV
@app.route("/import_criteria_matrix", methods=["POST"])
def import_criteria_matrix():
    if 'file' not in request.files:
        return jsonify({'error': 'Không tìm thấy file trong yêu cầu.'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Không có file được chọn.'}), 400
    
    if file:
        try:
            file_extension = file.filename.rsplit('.', 1)[1].lower()
            if file_extension in ['xlsx', 'xls']:
                df = pd.read_excel(file.stream, header=None)
            elif file_extension == 'csv':
                df = pd.read_csv(file.stream, header=None)
            else:
                return jsonify({'error': 'Định dạng file không được hỗ trợ. Vui lòng tải lên file Excel (.xlsx, .xls) hoặc CSV (.csv).'}), 400
            
            matrix_data = df.values.tolist()
            
            # Convert all values to float and validate
            for r_idx, row in enumerate(matrix_data):
                for c_idx, val in enumerate(row):
                    try:
                        matrix_data[r_idx][c_idx] = float(val)
                    except ValueError:
                        return jsonify({'error': f'Dữ liệu không hợp lệ trong file: "{val}" tại hàng {r_idx+1}, cột {c_idx+1} không phải là số.'}), 400
            
            expected_size = len(CRITERIA)
            if not matrix_data or len(matrix_data) != expected_size or any(len(row) != expected_size for row in matrix_data):
                return jsonify({'error': f'Kích thước ma trận không khớp. Cần ma trận {expected_size}x{expected_size} cho tiêu chí.'}), 400

            return jsonify({'matrix': matrix_data, 'message': 'Ma trận tiêu chí đã được nhập thành công.'})

        except Exception as e:
            print(f"Error importing criteria matrix: {e}")
            return jsonify({'error': f'Đã xảy ra lỗi khi xử lý file: {str(e)}'}), 500
    
    return jsonify({'error': 'Lỗi không xác định khi tải file.'}), 500

# NEW: Endpoint để nhập ma trận thương hiệu từ file Excel/CSV
@app.route("/import_brand_matrix/<int:criterion_index>", methods=["POST"])
def import_brand_matrix(criterion_index):
    if 'file' not in request.files:
        return jsonify({'error': 'Không tìm thấy file trong yêu cầu.'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Không có file được chọn.'}), 400
    
    if not (0 <= criterion_index < len(CRITERIA)):
        return jsonify({"error": "Chỉ số tiêu chí không hợp lệ."}), 400

    if file:
        try:
            file_extension = file.filename.rsplit('.', 1)[1].lower()
            if file_extension in ['xlsx', 'xls']:
                df = pd.read_excel(file.stream, header=None)
            elif file_extension == 'csv':
                df = pd.read_csv(file.stream, header=None)
            else:
                return jsonify({'error': 'Định dạng file không được hỗ trợ. Vui lòng tải lên file Excel (.xlsx, .xls) hoặc CSV (.csv).'}), 400
            
            matrix_data = df.values.tolist()
            
            # Convert all values to float and validate
            for r_idx, row in enumerate(matrix_data):
                for c_idx, val in enumerate(row):
                    try:
                        matrix_data[r_idx][c_idx] = float(val)
                    except ValueError:
                        return jsonify({'error': f'Dữ liệu không hợp lệ trong file: "{val}" tại hàng {r_idx+1}, cột {c_idx+1} không phải là số.'}), 400

            expected_size = len(BRANDS)
            if not matrix_data or len(matrix_data) != expected_size or any(len(row) != expected_size for row in matrix_data):
                return jsonify({'error': f'Kích thước ma trận không khớp. Cần ma trận {expected_size}x{expected_size} cho thương hiệu.'}), 400

            return jsonify({'matrix': matrix_data, 'message': f'Ma trận thương hiệu cho "{CRITERIA[criterion_index]}" đã được nhập thành công.'})

        except Exception as e:
            print(f"Error importing brand matrix for criterion {criterion_index}: {e}")
            return jsonify({'error': f'Đã xảy ra lỗi khi xử lý file: {str(e)}'}), 500
    
    return jsonify({'error': 'Lỗi không xác định khi tải file.'}), 500


if __name__ == '__main__':
    app.run(debug=True)
