class MenuItemModel {
  MenuItemModel({required this.name, this.section, this.desc = '', required this.price, this.salePrice, this.photo});
  final String name;

  /// Tiêu đề nhóm hiện phía trên món này (nếu có), ví dụ "MATCHA FAVORITES".
  final String? section;
  final String desc;

  /// Giá đã định dạng, ví dụ "58,000".
  final String price;
  /// Giá khuyến mãi (flash deal), nếu có.
  final String? salePrice;
  final String? photo;

  factory MenuItemModel.fromJson(Map<String, dynamic> j) => MenuItemModel(
        name: j['name'] ?? '',
        section: j['section'],
        desc: j['desc'] ?? '',
        price: (j['price'] ?? '').toString(),
        salePrice: j['sale_price']?.toString(),
        photo: j['photo'],
      );

  Map<String, dynamic> toJson() => {'name': name, 'price': price};
}
