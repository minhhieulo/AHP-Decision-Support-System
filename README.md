# 📊 Hệ Thống Hỗ Trợ Ra Quyết Định AHP

Đây là một ứng dụng web mạnh mẽ được xây dựng bằng Flask (Python) và sử dụng phương pháp Phân tích Thứ bậc (Analytical Hierarchy Process - AHP) để hỗ trợ quá trình ra quyết định đa tiêu chí. Ứng dụng cung cấp một giao diện trực quan cho phép người dùng định nghĩa, quản lý, và so sánh các tiêu chí và phương án một cách linh hoạt, sau đó tính toán trọng số ưu tiên và đưa ra khuyến nghị rõ ràng.

## 🌟 Các Tính Năng Nổi Bật

* **Quản lý động Tiêu chí & Phương án:** Dễ dàng thêm, sửa, xóa các tiêu chí và phương án trực tiếp thông qua giao diện người dùng. Hỗ trợ yêu cầu tối thiểu 3 lựa chọn cho mỗi loại để đảm bảo tính toán AHP hợp lệ.
* **Ma trận so sánh cặp:** Cung cấp các biểu mẫu trực quan để người dùng nhập giá trị so sánh cặp cho tiêu chí và các phương án dựa trên từng tiêu chí cụ thể.
* **Kiểm tra nhất quán (Consistency Ratio - CR):** Tự động tính toán và hiển thị tỷ lệ nhất quán của các ma trận so sánh, giúp người dùng đánh giá độ tin cậy của các đánh giá. Cảnh báo và yêu cầu điều chỉnh nếu ma trận không nhất quán (CR >= 0.1).
* **Tính toán trọng số:** Sử dụng thuật toán AHP để tính toán trọng số ưu tiên của các tiêu chí và điểm số tổng hợp cuối cùng của các phương án.
* **Khuyến nghị thông minh:** Đưa ra khuyến nghị về phương án tốt nhất dựa trên điểm số tổng hợp đã tính toán.
* **Biểu đồ trực quan:** Trình bày kết quả tính toán (trọng số tiêu chí, điểm số phương án) dưới dạng biểu đồ Pie và Bar Chart sinh động, giúp người dùng dễ dàng hình dung và phân tích.
* **Lịch sử tính toán:** Lưu trữ toàn bộ lịch sử các lần tính toán vào cơ sở dữ liệu MongoDB, cho phép người dùng xem lại chi tiết bất kỳ kết quả nào đã lưu.
* **Xuất dữ liệu linh hoạt:** Hỗ trợ xuất kết quả tính toán tổng hợp sang file Excel (`.xlsx`) hoặc PDF (`.pdf`) để lưu trữ, báo cáo hoặc chia sẻ.
* **Nhập dữ liệu từ Excel:** Cho phép nhập trực tiếp ma trận so sánh từ file Excel, giúp tăng tốc độ nhập liệu cho các tập dữ liệu lớn.

## 🛠️ Yêu Cầu Hệ Thống

Để chạy ứng dụng này, bạn cần cài đặt các thành phần sau trên máy tính của mình:

* **Python 3.7+** (Khuyến nghị phiên bản mới nhất)
* **pip** (Trình quản lý gói của Python - thường đi kèm với Python)
* **MongoDB Community Server** (Cơ sở dữ liệu NoSQL)

## 📦 Hướng Dẫn Cài Đặt Chi Tiết

### Bước 1: Clone Repository (Tải Mã Nguồn)

Nếu bạn chưa có mã nguồn, hãy clone repository này về máy tính của bạn. Mở Terminal (hoặc Command Prompt/Git Bash trên Windows) và chạy lệnh:

```bash
git clone <địa_chỉ_repo_của_bạn>
cd <tên_thư_mục_repo> # Ví dụ: cd AHP-Decision-Support-System
Bước 2: Cài Đặt Môi Trường Python
Để quản lý các thư viện Python một cách độc lập cho dự án, bạn nên sử dụng một môi trường ảo (virtual environment).

Tạo môi trường ảo:

Bash

python -m venv venv
Kích hoạt môi trường ảo:

Trên Windows:
Bash

.\venv\Scripts\activate
Trên macOS/Linux:
Bash

source venv/bin/activate
(Bạn sẽ thấy (venv) xuất hiện ở đầu dòng lệnh, báo hiệu môi trường ảo đã được kích hoạt.)

Cài đặt các thư viện cần thiết:
Đảm bảo bạn đang ở thư mục gốc của dự án (nơi có file app.py và requirements.txt). Sau đó, chạy lệnh:

Bash

pip install -r requirements.txt
Nếu bạn không có file requirements.txt, bạn có thể tạo nó bằng cách cài đặt thủ công các thư viện sau và sau đó chạy pip freeze > requirements.txt:

Flask
pymongo
numpy
pandas
openpyxl
xlsxwriter
reportlab
Flask-PyMongo
Flask-Cors (Nếu bạn sử dụng CORS)
Bước 3: Cài Đặt và Khởi Chạy MongoDB
Ứng dụng này sử dụng MongoDB để lưu trữ dữ liệu về tiêu chí, phương án và lịch sử tính toán.

Tải xuống MongoDB Community Server:
Truy cập trang tải xuống chính thức của MongoDB: https://www.mongodb.com/try/download/community
Chọn phiên bản và hệ điều hành phù hợp, sau đó tải xuống và cài đặt.

Tạo thư mục dữ liệu cho MongoDB:
MongoDB cần một thư mục để lưu trữ dữ liệu. Theo mặc định, nó sử dụng C:\data\db trên Windows hoặc /data/db trên Linux/macOS. Bạn cần tạo thư mục này nếu nó chưa tồn tại:

Trên Windows (trong Command Prompt với quyền Admin):
Bash

mkdir C:\data\db
Trên macOS/Linux (trong Terminal):
Bash

sudo mkdir -p /data/db
sudo chown -R `id -un` /data/db
Nếu bạn muốn sử dụng một đường dẫn khác, hãy nhớ ghi lại đường dẫn đó.

Khởi động MongoDB Server (mongod):
Mở một cửa sổ Terminal hoặc Command Prompt/PowerShell mới (không phải cửa sổ đang chạy môi trường ảo của bạn) và chạy lệnh mongod.

Nếu bạn đã tạo thư mục dữ liệu mặc định (C:\data\db hoặc /data/db):
Bash

mongod
Nếu bạn sử dụng đường dẫn khác (ví dụ: D:\mongodb_data):
Bash

mongod --dbpath D:\mongodb_data
Để MongoDB chạy ổn định, bạn nên cân nhắc thiết lập nó như một dịch vụ nền (background service) trên hệ điều hành của mình. Tham khảo tài liệu MongoDB chính thức để biết hướng dẫn chi tiết.

Xác nhận kết nối MongoDB:
Ứng dụng của bạn sẽ cố gắng kết nối đến MongoDB trên localhost tại cổng 27017 (cổng mặc định). Nếu MongoDB của bạn chạy trên một địa chỉ hoặc cổng khác, bạn cần chỉnh sửa biến MONGO_URI trong file app.py của bạn.

▶️ Cách Chạy Ứng Dụng
Sau khi hoàn thành các bước cài đặt và đảm bảo MongoDB đang chạy:

Đảm bảo môi trường ảo đã được kích hoạt (xem Bước 2.2).

Đảm bảo MongoDB Server đang chạy (xem Bước 3.3).

Chạy ứng dụng Flask:
Từ thư mục gốc của dự án (nơi có app.py), chạy lệnh:

Bash

python app.py
Bạn sẽ thấy một thông báo tương tự như:

* Serving Flask app 'app'
* Debug mode: on
WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
* Running on [http://127.0.0.1:5000](http://127.0.0.1:5000)
Press CTRL+C to quit
Truy cập ứng dụng:
Mở trình duyệt web yêu thích của bạn (như Chrome, Firefox, Edge) và truy cập vào địa chỉ sau:

[http://127.0.0.1:5000/](http://127.0.0.1:5000/)
Bạn sẽ thấy giao diện của Hệ Thống Hỗ Trợ Ra Quyết Định AHP.

📂 Cấu Trúc Thư Mục Dự Án
Dự án của bạn nên có cấu trúc thư mục như sau để Flask có thể nhận diện các file:

.
├── app.py                      # Logic chính của ứng dụng Flask và API
├── requirements.txt            # Danh sách các thư viện Python cần thiết
├── README.md                   # File hướng dẫn này
├── static/                     # Chứa các file tĩnh (CSS, JS, hình ảnh)
│   ├── css/
│   │   └── style.css           # CSS tùy chỉnh cho giao diện
│   └── js/
│       └── script.js           # Logic JavaScript cho tương tác người dùng
├── templates/                  # Chứa các file HTML
│   └── index.html              # File HTML chính của giao diện người dùng
└── .gitignore                  # (Tùy chọn) File để bỏ qua các file/thư mục không cần đẩy lên Git
📝 Hướng Dẫn Sử Dụng Ứng Dụng
Sau khi ứng dụng chạy và bạn truy cập vào trình duyệt:

Quản lý Tiêu chí và Phương án:

Trên trang chủ, bạn sẽ thấy phần "Quản lý Tiêu chí và Phương án".
Sử dụng các ô nhập liệu và nút "Thêm" để thêm các tiêu chí (ví dụ: Giá cả, Chất lượng, Thương hiệu) và phương án (ví dụ: Samsung, LG, Sony).
Bạn có thể xóa bất kỳ tiêu chí hoặc phương án nào đã thêm bằng nút "Xóa" bên cạnh.
Lưu ý quan trọng: Để tiến hành so sánh, bạn phải chọn ít nhất 3 tiêu chí và ít nhất 3 phương án từ các danh sách thả xuống (selectCriteriaForEvaluation và selectBrandsForComparison).
Đánh giá Tiêu chí (Ma trận so sánh cặp tiêu chí):

Sau khi chọn đủ tiêu chí, nhấn nút <i class="bi bi-table"></i> Tạo Bảng So sánh Tiêu chí.
Một bảng ma trận sẽ xuất hiện. Nhập các giá trị so sánh theo cặp (sử dụng thang Saaty 1-9) vào các ô màu trắng. Các ô trên đường chéo chính (luôn là 1) và các ô đối xứng phía dưới (nghịch đảo) sẽ tự động được điền.
Sau khi nhập, nhấn <i class="bi bi-check-circle"></i> Kiểm tra nhất quán tiêu chí. Ứng dụng sẽ tính toán tỷ lệ nhất quán (CR).
Nếu CR < 0.1: Ma trận nhất quán, bạn có thể tiếp tục.
Nếu CR >= 0.1: Ma trận không nhất quán. Bạn cần điều chỉnh lại các giá trị so sánh cho đến khi CR < 0.1 để đảm bảo độ tin cậy của kết quả.
Trọng số của từng tiêu chí sẽ được hiển thị cùng với biểu đồ Pie Chart.
So sánh Phương án (Ma trận so sánh cặp phương án theo từng tiêu chí):

Nhấn nút <i class="bi bi-table"></i> Tạo Bảng So sánh Phương án.
Các nút tiêu chí mà bạn đã chọn sẽ xuất hiện phía trên. Nhấn vào từng nút tiêu chí để hiển thị ma trận so sánh các phương án dưới góc độ của tiêu chí đó.
Thực hiện nhập liệu tương tự như khi so sánh tiêu chí. Ma trận này chỉ xuất hiện khi bạn chọn một tiêu chí cụ thể.
Kết quả Tổng hợp & Biểu đồ:

Sau khi đã nhập liệu đầy đủ cho tất cả các ma trận (tiêu chí và tất cả các ma trận phương án), nhấn nút <i class="bi bi-calculator"></i> Tính toán & Đưa ra Khuyến nghị.
Ứng dụng sẽ tính toán điểm số tổng hợp cuối cùng cho mỗi phương án dựa trên trọng số tiêu chí và trọng số của phương án theo từng tiêu chí.
Kết quả sẽ được hiển thị dưới dạng danh sách điểm số và một biểu đồ Bar Chart trực quan, cùng với tên phương án được khuyến nghị là tốt nhất.
Lịch sử & Xuất dữ liệu:

Bạn có thể truy cập phần "Lịch sử & Xuất" từ thanh điều hướng.
Nhấn <i class="bi bi-arrow-clockwise"></i> Tải lịch sử để xem lại các lần tính toán trước đó.
Sử dụng <i class="bi bi-trash"></i> Xóa lịch sử để xóa toàn bộ dữ liệu lịch sử.
Sử dụng <i class="bi bi-file-earmark-excel"></i> Xuất Excel hoặc <i class="bi bi-file-earmark-pdf"></i> Xuất PDF để tải về báo cáo kết quả.