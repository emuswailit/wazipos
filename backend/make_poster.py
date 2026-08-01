import os
from reportlab.lib.pagesizes import A3
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

def create_a3_poster(filename="wazipos_a3_poster.pdf"):
    # Target A3 Page Layout (841.89 x 1190.55 points)
    doc = SimpleDocTemplate(
        filename,
        pagesize=A3,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Precise #2563eb Royal Blue Brand Palette
    brand_blue = colors.HexColor("#2563eb")
    dark_text = colors.HexColor("#1e293b")
    
    # Typography Schemes
    company_style = ParagraphStyle(
        'CompanyHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=30,
        alignment=TA_CENTER,
        textColor=brand_blue
    )
    
    brand_style = ParagraphStyle(
        'BrandHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=54,
        leading=62,
        alignment=TA_CENTER,
        textColor=brand_blue
    )
    
    headline_style = ParagraphStyle(
        'HeadlineText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=38,
        leading=46,
        alignment=TA_CENTER,
        textColor=dark_text
    )
    
    banner_style = ParagraphStyle(
        'BannerText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=28,
        leading=34,
        alignment=TA_CENTER,
        textColor=colors.white
    )
    
    feature_style = ParagraphStyle(
        'FeatureText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=32,
        alignment=TA_LEFT,
        textColor=dark_text
    )
    
    footer_style = ParagraphStyle(
        'FooterText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=28,
        alignment=TA_CENTER,
        textColor=colors.white
    )

    story = []
    
    # 1. Company Name Heading
    story.append(Paragraph("WAZIPOS COMMERCIAL TECHNOLOGIES", company_style))
    story.append(Spacer(1, 15))
    
    # 2. Main Brand Title
    story.append(Paragraph("WAZIPOS", brand_style))
    story.append(Spacer(1, 40))
    
    # 3. Main Poster Graphic Frame
    img_placeholder_style = TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOX', (0,0), (-1,-1), 3, brand_blue),
        ('BOTTOMPADDING', (0,0), (-1,-1), 180),
        ('TOPPADDING', (0,0), (-1,-1), 180),
    ])
    placeholder_text = ParagraphStyle('PlText', parent=styles['Normal'], alignment=TA_CENTER, fontSize=20, textColor=colors.gray)
    img_table = Table([[Paragraph("[ Place / Overlay Your Image Artwork Here ]", placeholder_text)]], colWidths=[720])
    img_table.setStyle(img_placeholder_style)
    story.append(img_table)
    story.append(Spacer(1, 45))
    
    # 4. Impact Statements
    story.append(Paragraph("WANT PASSIVE INCOME?", headline_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("TURN YOUR WIFI INTO PROFIT!", headline_style))
    story.append(Spacer(1, 30))
    
    # 5. Accent Core Banner
    banner_text = Paragraph("MONETIZE YOUR WIFI WITH WAZIPOS!", banner_style)
    banner_table = Table([[banner_text]], colWidths=[740])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), brand_blue),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 15),
        ('BOTTOMPADDING', (0,0), (-1,-1), 15),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 40))
    
    # 6. Selling Features & Capabilities
    f1 = Paragraph("<b>✓  1. Set Custom Tariffs (Daily, Monthly!)</b>", feature_style)
    f2 = Paragraph("<b>✓  2. Full Control with Your Own Portal!</b>", feature_style)
    
    features_table = Table([[f1], [Spacer(1, 12)], [f2]], colWidths=[650], hAlign='CENTER')
    story.append(features_table)
    story.append(Spacer(1, 55))
    
    # 7. Call To Action Header
    story.append(Paragraph("CONTACT US TO GET STARTED TODAY!", headline_style))
    story.append(Spacer(1, 25))
    
    # 8. Clean Contact Info Footer Block
    contact_info = Paragraph("✉ info@wazipos.co.ke   |   🌐 www.wazipos.co.ke   |   📳 Call / WhatsApp: +254700829309", footer_style)
    footer_table = Table([[contact_info]], colWidths=[760])
    footer_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), brand_blue),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 20),
        ('BOTTOMPADDING', (0,0), (-1,-1), 20),
    ]))
    story.append(footer_table)
    
    # Build Document Output
    doc.build(story)

if __name__ == "__main__":
    create_a3_poster()
