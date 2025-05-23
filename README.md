📊 Hệ Thống Hỗ Trợ Ra Quyết Định AHP
Hệ thống này là một ứng dụng web mạnh mẽ, được xây dựng dựa trên phương pháp Phân tích Thứ bậc (Analytical Hierarchy Process - AHP) để hỗ trợ quá trình ra quyết định đa tiêu chí. Ứng dụng cung cấp một giao diện người dùng trực quan, cho phép bạn định nghĩa, quản lý và so sánh các tiêu chí cũng như phương án một cách linh hoạt, từ đó tính toán trọng số ưu tiên và đưa ra các khuyến nghị rõ ràng.

✨ Các Tính Năng Chính
Quản lý linh hoạt Tiêu chí & Phương án:

Thêm, sửa, xóa các tiêu chí và phương án (ví dụ: thương hiệu) trực tiếp trên giao diện.

Yêu cầu tối thiểu 3 lựa chọn cho mỗi loại để đảm bảo tính toán AHP hợp lệ.

Ma trận so sánh cặp trực quan:

Giao diện thân thiện để bạn nhập giá trị so sánh cặp cho các tiêu chí và giữa các phương án dựa trên từng tiêu chí cụ thể.

Kiểm tra nhất quán (Consistency Ratio - CR) tự động:

Tính toán và hiển thị tỷ lệ nhất quán của các ma trận so sánh.

Đảm bảo độ tin cậy của đánh giá: hệ thống cảnh báo và yêu cầu điều chỉnh nếu ma trận không nhất quán (CR ≥ 0.1).

Tính toán trọng số ưu tiên:

Áp dụng thuật toán AHP để xác định trọng số ưu tiên của từng tiêu chí và tổng hợp điểm số cuối cùng cho các phương án.

Đề xuất khuyến nghị thông minh:

Tự động đề xuất phương án tối ưu dựa trên điểm số tổng hợp.

Trực quan hóa dữ liệu mạnh mẽ:

Trình bày trọng số tiêu chí và điểm số phương án bằng biểu đồ Pie Chart và Bar Chart sinh động, giúp bạn dễ dàng phân tích và đưa ra quyết định.

Lịch sử tính toán:

Lưu trữ toàn bộ lịch sử các phiên tính toán vào cơ sở dữ liệu MongoDB, cho phép bạn xem lại chi tiết bất kỳ kết quả đã lưu trữ nào.

Xuất nhập dữ liệu tiện lợi:

Xuất: Kết quả tính toán tổng hợp có thể được xuất sang file Excel (.xlsx) hoặc PDF (.pdf) để báo cáo hoặc chia sẻ.

Nhập: Hỗ trợ nhập ma trận so sánh trực tiếp từ file Excel, giúp tiết kiệm thời gian nhập liệu cho các tập dữ liệu lớn.

🚀 Bắt Đầu Nhanh
🛠️ Yêu Cầu Hệ Thống
Để chạy ứng dụng này, bạn cần cài đặt các thành phần sau trên máy tính của mình:

Python 3.7+ (Khuyến nghị phiên bản mới nhất)

pip (Trình quản lý gói của Python - thường đi kèm với Python)

MongoDB Community Server (Cơ sở dữ liệu NoSQL)

📦 Hướng Dẫn Cài Đặt Chi Tiết
Bước 1: Tải Mã Nguồn (Clone Repository)
Mở Terminal (hoặc Command Prompt/Git Bash trên Windows), điều hướng đến thư mục bạn muốn lưu trữ dự án và chạy lệnh sau:

# Thay thế <YOUR_REPO_URL> bằng URL repository GitHub của bạn
git clone <YOUR_REPO_URL>
cd <your-repo-name> # Ví dụ: cd AHP-Decision-Support-System

Bước 2: Thiết Lập Môi Trường Python
Để quản lý các thư viện Python độc lập cho dự án, bạn nên sử dụng một môi trường ảo (virtual environment).

Tạo môi trường ảo:

python -m venv venv

Kích hoạt môi trường ảo:

Trên Windows:

.\venv\Scripts\activate

Trên macOS / Linux:

source venv/bin/activate

(Bạn sẽ thấy (venv) xuất hiện ở đầu dòng lệnh, báo hiệu môi trường ảo đã được kích hoạt.)

Cài đặt các thư viện cần thiết:
Đảm bảo bạn đang ở thư mục gốc của dự án (nơi có file app.py và requirements.txt). Sau đó, chạy lệnh:

pip install -r requirements.txt

Nếu bạn không có file requirements.txt, hãy tạo nó bằng cách cài đặt thủ công các thư viện sau và sau đó chạy pip freeze > requirements.txt:

Flask

pymongo

numpy

pandas

openpyxl

xlsxwriter

reportlab

Flask-PyMongo

Flask-Cors (Nếu cần cho môi trường phát triển)

python-dotenv (Nếu bạn dùng để quản lý biến môi trường)

Bước 3: Cài Đặt và Khởi Chạy MongoDB
Ứng dụng này sử dụng MongoDB để lưu trữ dữ liệu.

Tải xuống và cài đặt MongoDB Community Server từ trang web chính thức.

Tạo thư mục dữ liệu cho MongoDB: MongoDB cần một thư mục để lưu trữ dữ liệu. Theo mặc định, nó sử dụng C:\data\db trên Windows hoặc /data/db trên Linux/macOS. Bạn cần tạo thư mục này nếu nó chưa tồn tại:

Trên Windows (chạy Command Prompt với quyền quản trị viên):

md "C:\data\db"

Trên macOS / Linux (trong Terminal):

sudo mkdir -p /data/db
sudo chown -R `id -un` /data/db

Nếu bạn muốn lưu trữ dữ liệu ở một vị trí khác, hãy ghi nhớ đường dẫn đó.

Khởi động MongoDB Server (mongod): Mở một cửa sổ Terminal hoặc Command Prompt/PowerShell mới (không phải cửa sổ đang chạy môi trường ảo của bạn) và chạy lệnh mongod.

Nếu bạn đã tạo thư mục dữ liệu mặc định:

mongod

Nếu bạn sử dụng đường dẫn khác (ví dụ: D:\mongodb_data):

mongod --dbpath D:\mongodb_data

Để MongoDB chạy ổn định trong nền, bạn nên cân nhắc thiết lập nó như một dịch vụ hệ thống. Tham khảo tài liệu MongoDB chính thức để biết hướng dẫn chi tiết.

Kiểm tra cấu hình MongoDB trong app.py: Ứng dụng sẽ cố gắng kết nối đến MongoDB trên localhost tại cổng 27017 (cổng mặc định). Nếu MongoDB của bạn chạy trên một địa chỉ hoặc cổng khác, bạn cần chỉnh sửa biến MONGO_URI trong file app.py của bạn.

▶️ Chạy Ứng Dụng
Sau khi hoàn tất các bước cài đặt và đảm bảo MongoDB đang chạy:

Đảm bảo môi trường ảo đã được kích hoạt (kiểm tra (venv) ở đầu dòng lệnh).

Đảm bảo MongoDB Server đang chạy (mở cửa sổ mongod riêng).

Chạy ứng dụng Flask:
Từ thư mục gốc của dự án (nơi có app.py), chạy lệnh:

python app.py

Bạn sẽ thấy một thông báo tương tự như:

* Serving Flask app 'app'
* Debug mode: on
...
* Running on http://127.0.0.1:5000
Press CTRL+C to quit

Truy cập ứng dụng:
Mở trình duyệt web của bạn và truy cập vào địa chỉ sau:

http://127.0.0.1:5000/

Bạn sẽ thấy giao diện của Hệ Thống Hỗ Trợ Ra Quyết Định AHP.

📁 Cấu Trúc Thư Mục Dự Án
Dự án của bạn nên có cấu trúc thư mục như sau để Flask có thể nhận diện các file một cách chính xác:

AHP-Decision-Support-System/
├── app.py                  # Logic chính của ứng dụng Flask và API
├── requirements.txt        # Danh sách các thư viện Python cần thiết
├── README.md               # File hướng dẫn này
├── .gitignore              # (Tùy chọn) File để bỏ qua các file/thư mục không cần đẩy lên Git (ví dụ: venv/)
├── static/                 # Chứa các tài nguyên tĩnh (CSS, JS, hình ảnh)
│   ├── css/
│   │   └── style.css       # CSS tùy chỉnh cho giao diện
│   ├── fonts/              # Chứa font cho PDF (ví dụ: DejaVuSans.ttf)
│   │   └── DejaVuSans.ttf
│   │   └── DejaVuSans-Bold.ttf
│   ├── images/             # Chứa hình ảnh (ví dụ: logo.png)
│   │   └── logo.png
│   └── js/
│       └── script.js       # Logic JavaScript cho tương tác người dùng
└── templates/              # Chứa các file HTML được Flask render
    └── index.html          # File HTML chính của giao diện người dùng

🧑‍💻 Hướng Dẫn Sử Dụng Ứng Dụng
Sau khi ứng dụng chạy và bạn truy cập vào trình duyệt:

Đánh giá Tiêu chí (Ma trận so sánh cặp tiêu chí):

Trong phần "1. Đánh giá mức độ quan trọng của các tiêu chí", nhập các giá trị so sánh theo cặp (sử dụng thang Saaty 1-9) vào các ô màu trắng. Các ô này ban đầu sẽ trống, bạn cần nhập số vào. Các ô trên đường chéo chính (luôn là 1) và các ô đối xứng phía dưới (giá trị nghịch đảo) sẽ tự động được điền.

Sau khi nhập, nhấn " Kiểm tra nhất quán tiêu chí". Ứng dụng sẽ tính toán Tỷ lệ nhất quán (CR).

Ràng buộc nhập liệu: Nếu bạn để trống hoặc nhập giá trị không hợp lệ (không phải số, ngoài khoảng 1-9), hệ thống sẽ cảnh báo và làm nổi bật ô lỗi, yêu cầu bạn sửa trước khi tiếp tục.

Nếu CR < 0.1: Ma trận nhất quán, bạn có thể tiếp tục.

Nếu CR ≥ 0.1: Ma trận không nhất quán. Bạn cần điều chỉnh lại các giá trị so sánh cho đến khi CR < 0.1 để đảm bảo độ tin cậy của kết quả.

Trọng số của từng tiêu chí sẽ được hiển thị cùng với Biểu đồ Pie Chart trực quan.

So sánh Phương án (Ma trận so sánh cặp phương án theo từng tiêu chí):

Trong phần "2. So sánh các thương hiệu theo từng tiêu chí", bạn sẽ thấy các nút tương ứng với từng tiêu chí mà bạn đã chọn. Nhấn vào mỗi nút tiêu chí để hiển thị ma trận so sánh các phương án dưới góc độ của tiêu chí đó.

Tiến hành nhập liệu tương tự như khi so sánh tiêu chí. Ràng buộc nhập liệu tương tự cũng được áp dụng tại đây.

Sau khi một ma trận thương hiệu đạt nhất quán, một dấu tích màu xanh sẽ xuất hiện trên nút tiêu chí tương ứng, giúp bạn dễ dàng theo dõi tiến độ.

Kết quả Tổng hợp & Biểu đồ:

Sau khi đã nhập liệu đầy đủ và đảm bảo tất cả các ma trận (tiêu chí và tất cả các ma trận phương án theo từng tiêu chí) đều nhất quán, nút " Tính toán và Đưa ra Khuyến nghị" sẽ được kích hoạt. Nhấn vào nút này.

Ứng dụng sẽ tính toán điểm số tổng hợp cuối cùng cho mỗi phương án dựa trên trọng số tiêu chí và trọng số của phương án theo từng tiêu chí.

Kết quả sẽ được hiển thị dưới dạng danh sách điểm số và một Biểu đồ Bar Chart trực quan, cùng với tên phương án được khuyến nghị là tốt nhất.

Lịch sử & Xuất dữ liệu:

Bạn có thể truy cập phần "Lịch sử" từ thanh điều hướng.

Nhấn " Tải lịch sử" để xem lại các lần tính toán trước đó.

Sử dụng " Xóa lịch sử" để xóa toàn bộ dữ liệu lịch sử.

Sử dụng " Xuất Excel" hoặc " Xuất PDF" để tải về báo cáo kết quả.