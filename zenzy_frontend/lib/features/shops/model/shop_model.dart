import '../../map/model/map_data.dart' show asList;
import 'menu_item_model.dart';

class ShopNews {
  ShopNews({required this.image, required this.author, required this.timeText, required this.title, required this.body});
  final String image;
  final String author;
  final String timeText;
  final String title;
  final String body;

  factory ShopNews.fromJson(Map<String, dynamic> j) => ShopNews(
        image: j['image'] ?? '',
        author: j['author'] ?? '',
        timeText: j['time_text'] ?? '',
        title: j['title'] ?? '',
        body: j['body'] ?? '',
      );
}

class ShopModel {
  ShopModel({
    required this.id,
    required this.name,
    required this.address,
    required this.fullAddress,
    this.distanceText = '',
    this.ratingText = '',
    this.openText = '',
    this.hoursText = '',
    this.cover = 's08_cafe',
    this.badge = '',
    this.featuredTitle = '',
    this.featuredSubtitle = '',
    this.opening = '07:00',
    this.closing = '22:00',
    this.categories = const [],
    this.menu = const [],
    this.news = const [],
  });

  final String id;
  final String name;
  final String address;
  final String fullAddress;
  final String distanceText;
  final String ratingText;
  final String openText;
  final String hoursText;
  final String cover;
  final String badge;
  final String featuredTitle;
  final String featuredSubtitle;
  final String opening;
  final String closing;
  final List<String> categories;
  final List<MenuItemModel> menu;
  final List<ShopNews> news;

  factory ShopModel.fromJson(Map<String, dynamic> j) => ShopModel(
        id: j['id'].toString(),
        name: j['name'] ?? '',
        address: j['address'] ?? '',
        fullAddress: j['full_address'] ?? j['address'] ?? '',
        distanceText: j['distance_text'] ?? '',
        ratingText: j['rating_text'] ?? '',
        openText: j['open_text'] ?? '',
        hoursText: j['hours_text'] ?? '',
        cover: j['cover'] ?? 's08_cafe',
        badge: j['badge'] ?? '',
        featuredTitle: j['featured_title'] ?? '',
        featuredSubtitle: j['featured_subtitle'] ?? '',
        opening: j['opening'] ?? '07:00',
        closing: j['closing'] ?? '22:00',
        categories: [for (final c in (j['categories'] as List? ?? [])) c.toString()],
        menu: [for (final m in asList(j['menu'])) MenuItemModel.fromJson(m)],
        news: [for (final n in asList(j['news'])) ShopNews.fromJson(n)],
      );
}
