from flask import Flask, render_template, request, jsonify, send_file
import numpy as np
import datetime
from pymongo import MongoClient
from bson.objectid import ObjectId
import pandas as pd # Để xuất Excel và đọc Excel/CSV
import io # Để làm việc với bộ nhớ đệm cho file
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle 
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle 
from reportlab.lib.pagesizes import A4 
from reportlab.lib.enums import TA_CENTER, TA_LEFT 
from reportlab.lib import colors 
from reportlab.pdfbase import pdfmetrics 
from reportlab.pdfbase.ttfonts import TTFont 
from reportlab.lib.units import inch 

app = Flask(__name__)

# Cấu hình kích thước file tải lên tối đa (ví dụ: 16 MB)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16 Megabytes

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
    client.admin.command('ping')
    print("Successfully connected to MongoDB Atlas!")
except Exception as e:
    print(f"Error connecting to MongoDB Atlas: {e}")
# --- KẾT THÚC CẤU HÌNH MONGODB ---

# --- CẤU HÌNH FONT CHO PDF (QUAN TRỌNG CHO TIẾNG VIỆT) ---
try:
    pdfmetrics.registerFont(TTFont('DejaVuSans', 'static/fonts/DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', 'static/fonts/DejaVuSans-Bold.ttf'))
    print("PDF fonts registered successfully.")
except Exception as e:
    print(f"Warning: Could not register PDF fonts. Vietnamese characters might not display correctly: {e}")
# --- KẾT THÚC CẤU HÌNH FONT ---


# Định nghĩa các tiêu chí và thương hiệu đã được bản địa hóa
CRITERIA = ["Nhu cầu", "Giá cả", "Chất lượng", "Tiết kiệm điện", "Thương hiệu", "An toàn", "Thiết kế"] 
BRANDS = ["Samsung", "LG", "Panasonic", "Toshiba", "Aqua"] 

# Chỉ số ngẫu nhiên RI (Random Index) cho các kích thước ma trận (từ tài liệu AHP của Saaty)
RI = { 
    1: 0.00, 2: 0.00, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 
    9: 1.45, 10: 1.49, 11: 1.51, 12: 1.54, 13: 1.56, 14: 1.57, 15: 1.59
}

def calculate_ahp_core(matrix_data):
    """
    Hàm lõi để tính toán trọng số (eigenvector) và tỷ lệ nhất quán (CR)
    của một ma trận so sánh cặp.
    matrix_data: list of lists (dữ liệu ma trận từ JSON)
    """
    try:
        matrix = np.array(matrix_data, dtype=float)
    except ValueError:
        raise ValueError("Dữ liệu ma trận không hợp lệ. Đảm bảo tất cả là số.")

    n = matrix.shape[0]
    if n <= 1: # Ma trận 1x1 hoặc rỗng
        return np.array([1.0]).tolist(), 0.0, True

    # Kiểm tra ma trận vuông và không có NaN/inf
    if matrix.shape[0] != matrix.shape[1]:
        raise ValueError("Ma trận phải là ma trận vuông.")
    if np.isnan(matrix).any() or np.isinf(matrix).any():
        raise ValueError("Ma trận chứa các giá trị không hợp lệ (NaN hoặc Inf).")

    # Kiểm tra tổng cột để tránh chia cho 0 trong bước chuẩn hóa
    col_sums = np.sum(matrix, axis=0)
    if np.any(col_sums == 0):
        raise ValueError("Tổng cột bằng 0. Dữ liệu ma trận không hợp lệ.")

    # Chuẩn hóa ma trận (cách 1: chia cho tổng cột, sau đó trung bình hàng)
    normalized_matrix = matrix / col_sums
    weights = np.mean(normalized_matrix, axis=1)
    weights = weights / np.sum(weights) # Chuẩn hóa lại để tổng bằng 1

    # Tính Lambda Max (λ_max)
    weighted_sum_vector = np.dot(matrix, weights)
    
    consistency_vector = np.array([
        wsv / w if w > 1e-9 else 0 for wsv, w in zip(weighted_sum_vector, weights)
    ])
    
    lambda_max = np.mean(consistency_vector)

    # Tính chỉ số nhất quán CI
    CI = (lambda_max - n) / (n - 1) if (n - 1) > 0 else 0.0

    ri_value = RI.get(n, 1.60)
    
    # Tính tỷ lệ nhất quán CR
    cr = CI / ri_value if ri_value > 1e-9 else 0.0 

    # Kiểm tra tính nhất quán (CR < 0.1)
    return weights.tolist(), float(cr), bool(cr < 0.1)


@app.route('/')
def index():
    """
    Render trang chính của ứng dụng.
    Truyền danh sách tiêu chí và thương hiệu tới template.
    """
    return render_template('index.html', criteria=CRITERIA, brands=BRANDS)

# Endpoint để truyền biến cấu hình sang JavaScript
@app.route('/config.js')
def config_js():
    """
    Cung cấp các biến cấu hình (danh sách tiêu chí và thương hiệu)
    dưới dạng tệp JavaScript để frontend có thể sử dụng.
    """
    return app.response_class(
        f"const criteria_list = {jsonify(CRITERIA).data.decode('utf-8')};\n"
        f"const brands_list = {jsonify(BRANDS).data.decode('utf-8')};",
        mimetype='application/javascript'
    )

@app.route('/check_criteria_consistency', methods=['POST'])
def check_criteria_consistency():
    """
    Endpoint để kiểm tra tính nhất quán của ma trận tiêu chí.
    """
    data = request.json
    criteria_matrix_data = data.get('matrix')

    try:
        weights, cr, consistent = calculate_ahp_core(criteria_matrix_data)
        return jsonify({
            'weights': weights, 
            'cr': cr,
            'consistent': consistent
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'Lỗi server nội bộ: {str(e)}'}), 500

@app.route('/calculate', methods=['POST'])
def calculate():
    """
    Endpoint chính để tính toán tổng hợp điểm số thương hiệu
    dựa trên ma trận tiêu chí và ma trận thương hiệu con.
    Lưu kết quả vào MongoDB.
    """
    data = request.json
    criteria_matrix_data = data.get('criteria_matrix')
    brand_matrices_data = data.get('brand_matrices')

    try:
        # Tính toán trọng số của các tiêu chí
        criteria_weights, criteria_cr, criteria_consistent = calculate_ahp_core(criteria_matrix_data) 

        brand_overall_scores = {brand: 0.0 for brand in BRANDS}
        brand_weights_per_criterion = {} 

        for i, criterion_name in enumerate(CRITERIA):
            brand_matrix_for_criterion = brand_matrices_data.get(criterion_name)
            
            if not brand_matrix_for_criterion:
                continue

            brand_weights_for_criterion, brand_cr, brand_consistent = calculate_ahp_core(brand_matrix_for_criterion)
            
            brand_weights_per_criterion[criterion_name] = {
                'weights': brand_weights_for_criterion,
                'cr': brand_cr,
                'consistent': brand_consistent
            }

            for j, brand_name in enumerate(BRANDS):
                brand_overall_scores[brand_name] += criteria_weights[i] * brand_weights_for_criterion[j]

        final_brand_scores = sorted(brand_overall_scores.items(), key=lambda item: item[1], reverse=True)

        history_entry = {
            'timestamp': datetime.datetime.now(),
            'criteria_weights': criteria_weights,
            'criteria_cr': criteria_cr,
            'criteria_consistent': criteria_consistent,
            'final_brand_scores': final_brand_scores,
            'best_brand': final_brand_scores[0][0] if final_brand_scores else 'N/A'
        }
        
        if history_collection is not None:
            try:
                history_collection.insert_one(history_entry)
                print("History entry saved to MongoDB Atlas.")
            except Exception as e:
                print(f"Error saving to MongoDB Atlas: {e}")
        else:
            print("MongoDB connection not established, skipping saving history.")

        return jsonify({
            'criteria_weights': criteria_weights,
            'criteria_cr': criteria_cr,
            'criteria_consistent': criteria_consistent,
            'brand_weights_per_criterion': brand_weights_per_criterion,
            'final_brand_scores': final_brand_scores
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': f'Lỗi server nội bộ: {str(e)}'}), 500

# Endpoint để lấy lịch sử từ MongoDB với phân trang
@app.route('/history')
def get_history():
    """
    Lấy danh sách lịch sử tính toán từ MongoDB với hỗ trợ phân trang.
    """
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 5, type=int)

    history = []
    total_items = 0
    
    if history_collection is not None:
        try:
            total_items = history_collection.count_documents({})
            skip = (page - 1) * limit
            
            for entry in history_collection.find().sort("timestamp", -1).skip(skip).limit(limit):
                entry['_id'] = str(entry['_id']) 
                entry['timestamp'] = entry['timestamp'].strftime("%Y-%m-%d %H:%M:%S") 
                history.append(entry)
        except Exception as e:
            print(f"Error fetching history from MongoDB Atlas: {e}")
            return jsonify({'history': [], 'total_items': 0, 'error': 'Không thể tải lịch sử từ MongoDB.'}), 500
    else:
        print("MongoDB connection not established, cannot fetch history.")
        return jsonify({'history': [], 'total_items': 0, 'error': 'Kết nối MongoDB không được thiết lập.'}), 500
    
    return jsonify({'history': history, 'total_items': total_items, 'page': page, 'limit': limit})


# Endpoint để xóa lịch sử từ MongoDB
@app.route('/clear_history', methods=['POST'])
def clear_history():
    """
    Xóa toàn bộ lịch sử tính toán từ MongoDB.
    """
    if history_collection is not None:
        try:
            history_collection.delete_many({})
            print("History cleared from MongoDB Atlas.")
            return jsonify({'message': 'Lịch sử đã được xóa khỏi MongoDB Atlas.'})
        except Exception as e:
            print(f"Error clearing history from MongoDB Atlas: {e}")
            return jsonify({'message': 'Đã xảy ra lỗi khi xóa lịch sử từ MongoDB Atlas.'}), 500
    return jsonify({'message': 'Kết nối MongoDB không được thiết lập, không thể xóa lịch sử.'}), 500

@app.route('/export_excel')
def export_excel():
    """
    Xuất tất cả lịch sử tính toán ra file Excel.
    """
    if history_collection is None:
        return "Kết nối MongoDB không được thiết lập.", 500

    try:
        all_history_entries = list(history_collection.find().sort("timestamp", -1))
        
        data_for_df = []
        for entry in all_history_entries:
            row = {
                "Thời gian": entry.get('timestamp', 'N/A').strftime("%Y-%m-%d %H:%M:%S") if isinstance(entry.get('timestamp'), datetime.datetime) else entry.get('timestamp', 'N/A'),
                "CR Tiêu chí": f"{entry.get('criteria_cr', 0.0):.4f}",
                "Nhất quán Tiêu chí": "Có" if entry.get('criteria_consistent', False) else "Không",
                "Thương hiệu tốt nhất": entry.get('best_brand', 'N/A')
            }
            
            if 'criteria_weights' in entry and isinstance(entry['criteria_weights'], list):
                for i, weight in enumerate(entry['criteria_weights']):
                    row[f"Trọng số {CRITERIA[i]}"] = f"{weight*100:.2f}%" if i < len(CRITERIA) else f"{weight*100:.2f}% (Tiêu chí không xác định)"
            
            if 'final_brand_scores' in entry and isinstance(entry['final_brand_scores'], list):
                for brand_score in entry['final_brand_scores']:
                    if isinstance(brand_score, list) and len(brand_score) == 2:
                        row[f"Điểm số {brand_score[0]}"] = f"{brand_score[1]:.4f}"
            
            data_for_df.append(row)

        if not data_for_df:
            return "Không có dữ liệu lịch sử để xuất.", 404

        df = pd.DataFrame(data_for_df)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Lịch sử AHP')
        output.seek(0) 

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            download_name='lich_su_ahp.xlsx',
            as_attachment=True
        )
    except Exception as e:
        print(f"Error exporting to Excel: {e}")
        return f"Đã xảy ra lỗi khi xuất file Excel: {e}", 500

@app.route('/export_pdf')
def export_pdf():
    """
    Xuất tất cả lịch sử tính toán ra file PDF.
    """
    if history_collection is None:
        return "Kết nối MongoDB không được thiết lập.", 500

    try:
        all_history_entries = list(history_collection.find().sort("timestamp", -1))
        
        if not all_history_entries:
            return "Không có dữ liệu lịch sử để xuất.", 404

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

        return send_file(
            output,
            mimetype='application/pdf',
            download_name='lich_su_ahp.pdf',
            as_attachment=True
        )
    except Exception as e:
        print(f"Error exporting to PDF: {e}")
        return f"Đã xảy ra lỗi khi xuất file PDF: {e}", 500

# --- NEW: Endpoint để nhập ma trận tiêu chí từ Excel/CSV ---
@app.route('/import_criteria_matrix', methods=['POST'])
def import_criteria_matrix():
    if 'file' not in request.files:
        return jsonify({'error': 'Không có file nào được tải lên.'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Không có file nào được chọn.'}), 400
    
    if file:
        try:
            file_extension = file.filename.rsplit('.', 1)[1].lower()
            df = None
            if file_extension in ['xlsx', 'xls']:
                df = pd.read_excel(file.stream, header=None)
            elif file_extension == 'csv':
                df = pd.read_csv(file.stream, header=None)
            else:
                return jsonify({'error': 'Định dạng file không được hỗ trợ. Vui lòng tải lên file Excel (.xlsx, .xls) hoặc CSV (.csv).'}), 400
            
            # Chuyển DataFrame thành list of lists và đảm bảo tất cả là số
            matrix_data = df.values.tolist()
            # Kiểm tra xem tất cả các phần tử có thể chuyển đổi thành float không
            for row in matrix_data:
                for i, val in enumerate(row):
                    try:
                        row[i] = float(val)
                    except ValueError:
                        return jsonify({'error': f'Dữ liệu không hợp lệ trong file: "{val}" không phải là số.'}), 400

            # Kiểm tra kích thước ma trận
            expected_size = len(CRITERIA)
            if not matrix_data or len(matrix_data) != expected_size or any(len(row) != expected_size for row in matrix_data):
                return jsonify({'error': f'Kích thước ma trận không khớp. Cần ma trận {expected_size}x{expected_size}.'}), 400

            return jsonify({'matrix': matrix_data, 'message': 'Ma trận tiêu chí đã được nhập thành công.'})

        except Exception as e:
            print(f"Error importing criteria matrix: {e}")
            return jsonify({'error': f'Đã xảy ra lỗi khi xử lý file: {str(e)}'}), 500
    
    return jsonify({'error': 'Lỗi không xác định khi tải file.'}), 500

# --- NEW: Endpoint để nhập ma trận thương hiệu từ Excel/CSV ---
@app.route('/import_brand_matrix/<int:criterion_index>', methods=['POST'])
def import_brand_matrix(criterion_index):
    if 'file' not in request.files:
        return jsonify({'error': 'Không có file nào được tải lên.'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Không có file nào được chọn.'}), 400

    if not (0 <= criterion_index < len(CRITERIA)):
        return jsonify({'error': 'Chỉ số tiêu chí không hợp lệ.'}), 400
    
    if file:
        try:
            file_extension = file.filename.rsplit('.', 1)[1].lower()
            df = None
            if file_extension in ['xlsx', 'xls']:
                df = pd.read_excel(file.stream, header=None)
            elif file_extension == 'csv':
                df = pd.read_csv(file.stream, header=None)
            else:
                return jsonify({'error': 'Định dạng file không được hỗ trợ. Vui lòng tải lên file Excel (.xlsx, .xls) hoặc CSV (.csv).'}), 400
            
            matrix_data = df.values.tolist()
            for row in matrix_data:
                for i, val in enumerate(row):
                    try:
                        row[i] = float(val)
                    except ValueError:
                        return jsonify({'error': f'Dữ liệu không hợp lệ trong file: "{val}" không phải là số.'}), 400

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
